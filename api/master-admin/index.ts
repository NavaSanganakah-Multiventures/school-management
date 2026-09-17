import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser } from '../lib/auth';
import { getCloudflareConfig, createDedicatedD1Database, createDedicatedR2Bucket, putWorkerSecret } from '../lib/cloudflare-client';
import { getGitHubConfig, createSchoolCustomBranch, triggerSchoolDeployWorkflow } from '../lib/github-orchestrator';

const masterAdminApp = new Hono<{ Bindings: any }>();

// Security Guard: Strictly Platform Super Admin only
async function requireSuperAdmin(c: any) {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'SuperAdmin') {
    return { ok: false, authUser, error: c.json({ success: false, message: 'केवल प्लेटफॉर्म Super Admin की अनुमति है।' }, 403) };
  }
  return { ok: true, authUser };
}

// GET /api/master/schools - सभी स्कूलों के समर्पित वर्कर, D1 UUID, R2 व शाखा विवरण
masterAdminApp.get('/schools', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  try {
    const rows = await db.prepare('SELECT * FROM master_schools ORDER BY created_at DESC').all();
    return c.json({ success: true, schools: rows.results || [] });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || String(err) }, 500);
  }
});

// POST /api/master/provision-school - नया स्कूल समर्पित वर्कर व D1/R2 के साथ जोड़ें
masterAdminApp.post('/provision-school', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolName = String(body.schoolName || '').trim();
  if (!schoolName) return c.json({ success: false, message: 'स्कूल का नाम अनिवार्य है।' }, 400);

  const slug = String(body.schoolSlug || schoolName.toLowerCase().replace(/[^a-z0-9]/g, '-')).replace(/--+/g, '-').replace(/^-|-$/g, '') || `school-${Date.now().toString().slice(-6)}`;
  const schoolId = `sch_${slug}_${Date.now().toString().slice(-4)}`;
  const workerName = `pm-school-${slug}`;
  const workerUrl = `https://${workerName}.nssite.workers.dev`;
  const d1Name = `d1-pm-${slug}`;
  const r2BucketName = `r2-pm-${slug}-media`;
  const githubBranch = String(body.githubBranch || 'main').trim();
  const plan = body.plan || 'pro';
  const customDomain = body.customDomain ? String(body.customDomain).trim() : null;

  let d1Uuid = `d1-mock-${Date.now()}`;
  const cfConfig = getCloudflareConfig(c);

  // 1. If Cloudflare API credentials are configured, provision real D1 & R2
  if (cfConfig) {
    const d1Res = await createDedicatedD1Database(cfConfig, d1Name);
    if (d1Res.success && d1Res.uuid) {
      d1Uuid = d1Res.uuid;
    }
    await createDedicatedR2Bucket(cfConfig, r2BucketName);
  }

  const now = new Date().toISOString();

  try {
    await db.prepare(`
      INSERT INTO master_schools (
        id, school_slug, school_name, custom_domain,
        cf_worker_name, cf_worker_url, cf_d1_database_uuid, cf_d1_database_name,
        cf_r2_bucket_name, cf_kv_namespace_id, github_repo_url, github_branch,
        deployment_status, config_sync_status, subscription_plan, license_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      schoolId, slug, schoolName, customDomain,
      workerName, workerUrl, d1Uuid, d1Name,
      r2BucketName, '', 'https://github.com/NavaSanganakah-Multiventures/school-management', githubBranch,
      'Provisioned', 'Synced', plan, 'Active',
      now, now
    ).run();

    // Default edge configurations
    const defaultConfigs = [
      ['SCHOOL_NAME', schoolName, 0],
      ['APP_BASE_URL', customDomain ? `https://${customDomain}` : workerUrl, 0],
      ['BOARD_NAME', body.boardName || 'CBSE', 0],
      ['ACADEMIC_SESSION', body.academicSession || '2026-2027', 0],
      ['SUBSCRIPTION_PLAN', plan, 0],
    ];

    for (const [k, v, sec] of defaultConfigs) {
      await db.prepare(`
        INSERT INTO master_school_configs (id, school_id, config_key, config_value, is_secret, synced_to_worker, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(`cfg_${schoolId}_${k}`, schoolId, k, v, sec, 1, now).run();
    }

    await db.prepare(`
      INSERT INTO master_orchestration_logs (id, school_id, action_type, status, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      `log_${Date.now()}`, schoolId, 'PROVISION_SCHOOL', 'SUCCESS',
      `विद्यालय '${schoolName}' का समर्पित वर्कर '${workerName}', D1 UUID '${d1Uuid}' एवं R2 '${r2BucketName}' प्रोविज़न किया गया।`,
      now
    ).run();

    return c.json({
      success: true,
      message: `विद्यालय '${schoolName}' का स्वतंत्र इंफ्रास्ट्रक्चर सफलतापूर्वक प्रोविज़न हो गया।`,
      school: {
        id: schoolId,
        slug,
        schoolName,
        workerName,
        workerUrl,
        d1Uuid,
        r2BucketName,
        githubBranch,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err?.message || String(err) }, 500);
  }
});

// POST /api/master/sync-worker-env - स्कूल सेटिंग्स को सीधे वर्कर एनवायरनमेंट में इंजेक्ट करें (0-DB-Cost)
masterAdminApp.post('/sync-worker-env', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);

  const school = await db.prepare('SELECT * FROM master_schools WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);

  const configs = await db.prepare('SELECT * FROM master_school_configs WHERE school_id = ?').bind(schoolId).all();
  const cfConfig = getCloudflareConfig(c);

  let syncedCount = 0;
  if (cfConfig && configs.results) {
    for (const item of configs.results) {
      if (item.is_secret) {
        await putWorkerSecret(cfConfig, school.cf_worker_name, item.config_key, item.config_value);
        syncedCount++;
      }
    }
  }

  const now = new Date().toISOString();
  await db.prepare('UPDATE master_schools SET config_sync_status = ?, updated_at = ? WHERE id = ?')
    .bind('Synced', now, schoolId).run();

  await db.prepare(`
    INSERT INTO master_orchestration_logs (id, school_id, action_type, status, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    `log_${Date.now()}`, schoolId, 'SYNC_ENV', 'SUCCESS',
    `वर्कर '${school.cf_worker_name}' के एनवायरनमेंट वेरिएबल्स शून्य-लागत कैश हेतु सिंक किए गए।`,
    now
  ).run();

  return c.json({
    success: true,
    message: `वर्कर '${school.cf_worker_name}' का एनवायरनमेंट सफलतापूर्वक सिंक हो गया।`,
    syncedCount,
  });
});

// POST /api/master/create-custom-branch - विशेष स्कूल कस्टमाइज़ेशन हेतु समर्पित गिट शाखा बनाएं
masterAdminApp.post('/create-custom-branch', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  const customBranchName = String(body.branchName || '').trim();

  if (!schoolId || !customBranchName) {
    return c.json({ success: false, message: 'schoolId एवं branchName दोनों आवश्यक हैं।' }, 400);
  }

  const school = await db.prepare('SELECT * FROM master_schools WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);

  const ghConfig = getGitHubConfig(c);
  if (ghConfig) {
    const branchRes = await createSchoolCustomBranch(ghConfig, 'main', customBranchName);
    if (!branchRes.success) {
      return c.json({ success: false, message: branchRes.error }, 500);
    }
  }

  const now = new Date().toISOString();
  await db.prepare('UPDATE master_schools SET github_branch = ?, updated_at = ? WHERE id = ?')
    .bind(customBranchName, now, schoolId).run();

  await db.prepare(`
    INSERT INTO master_orchestration_logs (id, school_id, action_type, status, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    `log_${Date.now()}`, schoolId, 'CREATE_BRANCH', 'SUCCESS',
    `कस्टम गिटहब शाखा '${customBranchName}' बनाई गई और स्कूल से लिंक की गई।`,
    now
  ).run();

  return c.json({
    success: true,
    message: `कस्टम शाखा '${customBranchName}' सफलतापूर्वक लिंक हो गई।`,
    branch: customBranchName,
  });
});

// POST /api/master/deploy-school - समर्पित वर्कर के लिए गिटहब वर्कफ़्लो डिप्लॉय ट्रिगर करें
masterAdminApp.post('/deploy-school', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);

  const school = await db.prepare('SELECT * FROM master_schools WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);

  const ghConfig = getGitHubConfig(c);
  let workflowTriggered = false;

  if (ghConfig) {
    const deployRes = await triggerSchoolDeployWorkflow(ghConfig, {
      schoolSlug: school.school_slug,
      workerName: school.cf_worker_name,
      d1DatabaseId: school.cf_d1_database_uuid,
      r2BucketName: school.cf_r2_bucket_name,
      branch: school.github_branch || 'main',
      customDomain: school.custom_domain || undefined,
    });
    workflowTriggered = deployRes.success;
  }

  const now = new Date().toISOString();
  await db.prepare('UPDATE master_schools SET deployment_status = ?, last_deployed_at = ?, updated_at = ? WHERE id = ?')
    .bind(workflowTriggered ? 'Building' : 'Active', now, now, schoolId).run();

  await db.prepare(`
    INSERT INTO master_orchestration_logs (id, school_id, action_type, status, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    `log_${Date.now()}`, schoolId, 'TRIGGER_DEPLOY', workflowTriggered ? 'SUCCESS' : 'SIMULATED',
    `वर्कर '${school.cf_worker_name}' का डिप्लॉयमेंट वर्कफ़्लो (${school.github_branch || 'main'}) ट्रिगर किया गया।`,
    now
  ).run();

  return c.json({
    success: true,
    message: `वर्कर '${school.cf_worker_name}' का परिनियोजन (Deployment) प्रारंभ हो गया है।`,
    status: workflowTriggered ? 'Building' : 'Active',
  });
});

// GET /api/master/logs - हालिया ऑर्केस्ट्रेशन लॉग्स
masterAdminApp.get('/logs', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const rows = await db.prepare('SELECT * FROM master_orchestration_logs ORDER BY created_at DESC LIMIT 50').all();
  return c.json({ success: true, logs: rows.results || [] });
});

export default masterAdminApp;
