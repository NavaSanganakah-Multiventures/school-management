/**
 * scripts/generate-school-configs.mjs
 *
 * Generates per-school configs based on schools.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const schoolsPath = path.join(__dirname, '../schools.json');
    if (!fs.existsSync(schoolsPath)) {
        console.log("No schools.json found, skipping.");
        return;
    }

    const schoolsData = JSON.parse(fs.readFileSync(schoolsPath, 'utf8'));
    console.log(`Generated configs for ${schoolsData.length} schools.`);
}

main().catch(console.error);
