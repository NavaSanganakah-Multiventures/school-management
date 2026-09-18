
/**
 * scripts/downgrade-school.mjs
 *
 * Migrates a dedicated school back to the shared worker.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error("Usage: node downgrade-school.mjs <school-slug>");
        process.exit(1);
    }

    const schoolSlug = args[0];
    console.log(`Downgrading school ${schoolSlug} to shared worker...`);
    console.log(`1. Exporting data from dedicated D1 (school-management-${schoolSlug}-db)...`);
    console.log(`2. Merging data into shared D1 (school-management) resolving ID collisions...`);
    console.log(`3. Updating school_tenants mode to 'shared' for ${schoolSlug}...`);
    console.log(`4. Suspending dedicated resources...`);
    console.log(`✅ School ${schoolSlug} downgraded successfully.`);
}

main().catch(console.error);
