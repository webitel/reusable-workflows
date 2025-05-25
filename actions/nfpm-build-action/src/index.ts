import * as core from '@actions/core';
import * as io from '@actions/io';
import { ConfigGenerator, ContentFileParser, FileValidator  } from './config.ts'
import { NFPMInstaller, PackageBuilder } from './nfpm.ts';

export async function run(): Promise<void> {
    try {
        core.info('Starting NFPM package build process...');

        const nfpmVersion = core.getInput('nfpm-version') || '';
        const skipInstall = core.getBooleanInput('skip-install');
        const configFile = core.getInput('config-file') || '.nfpm.yaml';
        const formats = core.getInput('formats') || 'deb';
        const target = core.getInput('target') || 'dist';
        const contentFiles = ContentFileParser.parse(core.getInput('contents') || '');
        if (contentFiles.length > 0) {
            await FileValidator.validateSourceFiles(contentFiles);
        }

        await ConfigGenerator.generateNFPMConfig(configFile, contentFiles);
        await NFPMInstaller.install(nfpmVersion, skipInstall);

        // Create output directory
        await io.mkdirP(target);

        // Build packages
        const packages = await PackageBuilder.buildPackages(configFile, target, formats);

        // Set outputs
        const packagePaths = packages.map(pkg => pkg.path);
        const packageFilenames = packages.map(pkg => pkg.filename);

        core.setOutput('packages', packagePaths.join(','));
        core.setOutput('config-file', configFile);

        core.info('✅ Package build completed successfully!');
        core.info(`📦 Generated packages: ${packageFilenames.join(', ')}`);
        core.info(`📄 Config file: ${configFile}`);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        core.setFailed(`Action failed: ${errorMessage}`);
    }
}

// Execute if this is the main module
if (require.main === module) {
    run();
}