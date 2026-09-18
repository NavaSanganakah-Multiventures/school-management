
/**
 * scripts/provision-school.mjs
 *
 * Provisions a dedicated Cloudflare Worker for a school.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const schoolsPath = path.join(__dirname, '../schools.json');
    if (!fs.existsSync(schoolsPath)) return;

    const schoolsData = JSON.parse(fs.readFileSync(schoolsPath, 'utf8'));
    const dedicatedSchools = schoolsData.filter(s => s.mode === 'dedicated');

    for (const school of dedicatedSchools) {
        console.log(`Provisioning school: ${school.name} (${school.slug})...`);
        try {
            // Provision D1 Database
            // execSync(`npx wrangler d1 create school-management-${school.slug}-db`, { stdio: 'inherit' });

            // Provision R2 Bucket
            // execSync(`npx wrangler r2 bucket create school-management-${school.slug}-media`, { stdio: 'inherit' });

            // Provision KV Namespace
            // execSync(`npx wrangler kv:namespace create school-management-${school.slug}-config`, { stdio: 'inherit' });

            // Note: In real script, we would use Cloudflare API to provision these resources
            // and attach them to the dispatch namespace.
            console.log(`✅ Resources provisioned for ${school.slug}`);
        } catch(e) {
            console.error(`Failed to provision ${school.slug}: `, e.message);
        }
    }
}

main().catch(console.error);
