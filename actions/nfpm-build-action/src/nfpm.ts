import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as tc from '@actions/tool-cache';
import {promises as fs} from "fs";
import path from "path";

export interface PackageInfo {
    path: string;
    filename: string;
    format: string;
}

export type PackageFormat = 'deb' | 'rpm' | 'apk' | 'archlinux';

export interface GitHubRelease {
    tag_name: string;
}

export class NFPMInstaller {
    public static async install(version: string, skipInstall: boolean): Promise<void> {
        if (skipInstall) {
            core.info('Skipping NFPM installation as requested');
            return;
        }

        if (!version) {
            core.info('No NFPM version specified, assuming pre-installed');
            await this.verifyInstallation();
            return;
        }

        core.info('Installing NFPM...');

        let nfpmPath = tc.find('nfpm', version);

        if (!nfpmPath) {
            core.info(`NFPM version ${version} not found in cache, downloading...`);

            const actualVersion = await this.resolveVersion(version);
            const downloadUrl = this.getDownloadUrl(actualVersion);

            const downloadPath = await tc.downloadTool(downloadUrl);
            const extractPath = await tc.extractTar(downloadPath, undefined, 'xz');
            nfpmPath = await tc.cacheDir(extractPath, 'nfpm', actualVersion);
        }

        core.addPath(nfpmPath);

        // Verify installation
        await this.verifyInstallation();
    }

    private static async verifyInstallation(): Promise<void> {
        try {
            await exec.exec('nfpm', ['--version']);
            core.info('✅ NFPM is available and ready');
        } catch (error) {
            throw new Error('NFPM is not available. Please install NFPM or provide a version to install.');
        }
    }

    private static async resolveVersion(version: string): Promise<string> {
        if (version === 'latest') {
            const response = await fetch('https://api.github.com/repos/goreleaser/nfpm/releases/latest');

            if (!response.ok) {
                throw new Error(`Failed to fetch latest NFPM release: ${response.statusText}`);
            }

            const data = await response.json();
            const release = data as GitHubRelease;
            return release.tag_name.replace(/^v/, '');
        }

        return version;
    }

    private static getDownloadUrl(version: string): string {
        return `https://github.com/goreleaser/nfpm/releases/download/v${version}/nfpm_${version}_Linux_x86_64.tar.gz`;
    }
}

export class PackageBuilder {
    public static async buildPackages(configFile: string, target: string, formats: string): Promise<PackageInfo[]> {
        core.info('Building packages...');

        const pkgFormats = this.parseFormats(formats);
        const packages: PackageInfo[] = [];

        for (const format of pkgFormats) {
            core.info(`Building ${format.toUpperCase()} package...`);

            await exec.exec('nfpm', [
                'package',
                '--packager', format,
                '--target', target,
                '--config', configFile
            ]);

            // Find the generated package for this format
            const packageInfo = await this.findGeneratedPackage(target, format);
            packages.push(packageInfo);

            // Display package information
            await this.displayPackageInfo(packageInfo);
        }

        return packages;
    }

    private static parseFormats(formatsInput: string): PackageFormat[] {
        const formats = formatsInput
            .split(',')
            .map(format => format.trim().toLowerCase())
            .filter(format => format) as PackageFormat[];

        // Validate formats
        const validFormats: PackageFormat[] = ['deb', 'rpm', 'apk', 'archlinux'];
        for (const format of formats) {
            if (!validFormats.includes(format)) {
                throw new Error(`Invalid package format: ${format}. Valid formats are: ${validFormats.join(', ')}`);
            }
        }

        return formats.length > 0 ? formats : ['deb'];
    }

    private static async findGeneratedPackage(targetDir: string, format: PackageFormat): Promise<PackageInfo> {
        const files = await fs.readdir(targetDir);

        // Define file extensions for each format
        const extensions: Record<PackageFormat, string> = {
            deb: '.deb',
            rpm: '.rpm',
            apk: '.apk',
            archlinux: '.pkg.tar.xz'
        };

        const extension = extensions[format];
        const packageFile = files.find(file => file.endsWith(extension));

        if (!packageFile) {
            throw new Error(`No ${format.toUpperCase()} package found in ${targetDir}`);
        }

        return {
            path: path.join(targetDir, packageFile),
            filename: packageFile,
            format: format
        };
    }

    private static async displayPackageInfo(packageInfo: PackageInfo): Promise<void> {
        core.info(`📦 Generated ${packageInfo.format.toUpperCase()} package: ${packageInfo.filename}`);

        try {
            switch (packageInfo.format) {
                case 'deb':
                    core.info('Package information:');
                    await exec.exec('dpkg-deb', ['--info', packageInfo.path]);
                    core.info('Package contents:');
                    await exec.exec('dpkg-deb', ['--contents', packageInfo.path]);
                    break;
                case 'rpm':
                    core.info('Package information:');
                    await exec.exec('rpm', ['-qip', packageInfo.path]);
                    core.info('Package contents:');
                    await exec.exec('rpm', ['-qlp', packageInfo.path]);
                    break;
                case 'apk':
                    core.info('Package information:');
                    await exec.exec('apk', ['info', '--contents', packageInfo.path]);
                    break;
                case 'archlinux':
                    core.info('Package information:');
                    await exec.exec('tar', ['-tf', packageInfo.path]);
                    break;
            }
        } catch (error) {
            core.warning(`Could not display ${packageInfo.format.toUpperCase()} package info: ${(error as Error).message}`);
        }
    }
}