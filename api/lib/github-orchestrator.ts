/**
 * GitHub REST API Orchestrator for Pragnya Mitra
 * 
 * Manages dedicated GitHub repositories cloned from the main template repository,
 * creates custom branches, and triggers GitHub Actions workflows per school.
 */

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string; // Template / Main repo
}

/**
 * Generates a collision-safe unique ID using crypto random bytes.
 * Avoids Date.now() millisecond collisions in high-throughput scenarios.
 */
export function generateUniqueId(prefix: string = ''): string {
  const ts = Date.now().toString(36);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return prefix ? `${prefix}_${ts}_${rand}` : `${ts}_${rand}`;
}

/**
 * Retries a fetch call with exponential backoff on transient failures (5xx, 429, network errors).
 * @param fn - Async function that returns a Response
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @param baseDelayMs - Base delay in milliseconds (default: 500)
 */
async function fetchWithRetry(
  fn: () => Promise<Response>,
  maxRetries: number = 3,
  baseDelayMs: number = 500
): Promise<Response> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fn();
      // Retry on 429 (rate limit) or 5xx server errors
      if (attempt < maxRetries && (res.status === 429 || res.status >= 500)) {
        const retryAfter = res.headers.get('Retry-After');
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError || new Error('fetchWithRetry: सभी प्रयास विफल।');
}

export function getGitHubConfig(c: any): GitHubConfig | null {
  const token = (c.env && (c.env.GITHUB_TOKEN || c.env.GH_TOKEN)) || '';
  const fullRepo = (c.env && c.env.GITHUB_REPO) || 'NavaSanganakah-Multiventures/school-management';
  const parts = fullRepo.split('/');
  const owner = parts[0] || 'NavaSanganakah-Multiventures';
  const repo = parts[1] || 'school-management';

  if (!token) return null;
  return { token, owner, repo };
}

/**
 * Generates a dedicated school repository from the main template repository.
 * Uses GitHub API: POST /repos/{template_owner}/{template_repo}/generate
 */
export async function generateDedicatedSchoolRepository(
  config: GitHubConfig,
  params: {
    targetRepoName: string;
    schoolName: string;
    isPrivate?: boolean;
  }
): Promise<{ success: boolean; repoName: string; repoUrl: string; error?: string }> {
  const cleanName = params.targetRepoName.toLowerCase().replace(/[^a-z0-9-_.]/g, '-');
  const targetUrl = `https://github.com/${config.owner}/${cleanName}`;

  try {
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/generate`;
    const res = await fetchWithRetry(() => fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Pragnya-Mitra-Orchestrator',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        owner: config.owner,
        name: cleanName,
        description: `प्रज्ञा मित्र स्कूल प्रबंधन ईआरपी — ${params.schoolName} हेतु समर्पित रिपॉजिटरी`,
        include_all_branches: false,
        private: params.isPrivate ?? false,
      }),
    }));

    if (res.status === 201) {
      const data = await res.json() as any;
      return {
        success: true,
        repoName: cleanName,
        repoUrl: data.html_url || targetUrl,
      };
    }

    // 422: Repository already exists, treat as linked
    if (res.status === 422) {
      return {
        success: true,
        repoName: cleanName,
        repoUrl: targetUrl,
      };
    }

    const errData = await res.json().catch(() => ({})) as any;
    return {
      success: false,
      repoName: cleanName,
      repoUrl: targetUrl,
      error: errData.message || `गिटहब रिपो जनरेशन त्रुटि: HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      success: false,
      repoName: cleanName,
      repoUrl: targetUrl,
      error: err?.message || String(err),
    };
  }
}

/**
 * Dispatches a GitHub Actions workflow in a specific school's dedicated repository.
 */
export async function dispatchWorkflowInSchoolRepo(
  config: GitHubConfig,
  params: {
    repoName: string;
    workflowId?: string; // default: 'deploy.yml' or 'deploy-school-worker.yml'
    ref?: string;        // default: 'main'
    inputs?: Record<string, string>;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const workflow = params.workflowId || 'deploy-dedicated-school.yml';
    const targetRepo = params.repoName || config.repo;
    const url = `https://api.github.com/repos/${config.owner}/${targetRepo}/actions/workflows/${workflow}/dispatches`;

    const res = await fetchWithRetry(() => fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Pragnya-Mitra-Orchestrator',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: params.ref || 'main',
        inputs: params.inputs || {},
      }),
    }));

    if (res.status === 204) {
      return { success: true };
    }

    const errData = await res.json().catch(() => ({})) as any;
    return {
      success: false,
      error: errData.message || `वर्कफ़्लो डिस्पैच त्रुटि (${targetRepo}): HTTP ${res.status}`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Creates a dedicated branch (e.g., 'school/dps-custom') off base branch in target repo.
 */
export async function createSchoolCustomBranch(
  config: GitHubConfig,
  baseBranch: string,
  newBranchName: string,
  targetRepo?: string
): Promise<{ success: boolean; ref?: string; error?: string }> {
  const repo = targetRepo || config.repo;
  try {
    const refUrl = `https://api.github.com/repos/${config.owner}/${repo}/git/ref/heads/${baseBranch}`;
    const baseRes = await fetchWithRetry(() => fetch(refUrl, {
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Pragnya-Mitra-Orchestrator',
      },
    }));

    const baseData = await baseRes.json() as any;
    if (!baseData || !baseData.object || !baseData.object.sha) {
      return { success: false, error: `आधार शाखा '${baseBranch}' प्राप्त नहीं हुई।` };
    }

    const sha = baseData.object.sha;

    const createUrl = `https://api.github.com/repos/${config.owner}/${repo}/git/refs`;
    const createRes = await fetchWithRetry(() => fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Pragnya-Mitra-Orchestrator',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: `refs/heads/${newBranchName}`,
        sha,
      }),
    }));

    const createData = await createRes.json() as any;
    if (createRes.status === 201 || createRes.status === 422) {
      return { success: true, ref: `refs/heads/${newBranchName}` };
    }

    return { success: false, error: createData.message || 'गिटहब शाखा निर्माण विफल।' };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Dispatches the GitHub Actions deploy workflow.
 */
export async function triggerSchoolDeployWorkflow(
  config: GitHubConfig,
  params: {
    schoolSlug: string;
    workerName: string;
    d1DatabaseId: string;
    r2BucketName: string;
    branch: string;
    customDomain?: string;
    targetRepo?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  return dispatchWorkflowInSchoolRepo(config, {
    repoName: params.targetRepo || config.repo,
    workflowId: 'deploy-dedicated-school.yml',
    ref: params.branch || 'main',
    inputs: {
      school_slug: params.schoolSlug,
      worker_name: params.workerName,
      d1_database_id: params.d1DatabaseId,
      r2_bucket_name: params.r2BucketName,
      custom_domain: params.customDomain || '',
    },
  });
}
