/**
 * GitHub REST API Orchestrator for Pragnya Mitra
 * 
 * Manages school-specific custom git branches and triggers GitHub Actions
 * workflows to build and deploy dedicated workers per school.
 */

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
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
 * Creates a dedicated school branch (e.g., 'school/dps-custom') off base branch.
 */
export async function createSchoolCustomBranch(
  config: GitHubConfig,
  baseBranch: string,
  newBranchName: string
): Promise<{ success: boolean; ref?: string; error?: string }> {
  try {
    // 1. Get SHA of base branch
    const refUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/git/ref/heads/${baseBranch}`;
    const baseRes = await fetch(refUrl, {
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Pragnya-Mitra-Orchestrator',
      },
    });

    const baseData = await baseRes.json() as any;
    if (!baseData || !baseData.object || !baseData.object.sha) {
      return { success: false, error: `आधार शाखा '${baseBranch}' प्राप्त नहीं हुई।` };
    }

    const sha = baseData.object.sha;

    // 2. Create new branch ref
    const createUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/git/refs`;
    const createRes = await fetch(createUrl, {
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
    });

    const createData = await createRes.json() as any;
    if (createRes.status === 201) {
      return { success: true, ref: createData.ref };
    }

    if (createRes.status === 422) {
      // Branch already exists
      return { success: true, ref: `refs/heads/${newBranchName}` };
    }

    return { success: false, error: createData.message || 'गिटहब शाखा निर्माण विफल।' };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Dispatches the GitHub Actions workflow to compile and deploy a dedicated worker.
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
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const workflowId = 'deploy-dedicated-school.yml';
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/actions/workflows/${workflowId}/dispatches`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Pragnya-Mitra-Orchestrator',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: params.branch || 'main',
        inputs: {
          school_slug: params.schoolSlug,
          worker_name: params.workerName,
          d1_database_id: params.d1DatabaseId,
          r2_bucket_name: params.r2BucketName,
          custom_domain: params.customDomain || '',
        },
      }),
    });

    if (res.status === 204) {
      return { success: true };
    }

    const errData = await res.json().catch(() => ({})) as any;
    return { success: false, error: errData.message || `वर्कफ़्लो डिस्पैच त्रुटि: HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
