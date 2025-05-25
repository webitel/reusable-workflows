import * as core from '@actions/core';
import * as yaml from "js-yaml";
import {promises as fs} from "fs";

export interface ContentFile {
    src: string;
    dst: string;
    type?: 'file' | 'dir' | 'config' | 'symlink';
    file_info?: {
        mode?: string;
        owner?: string;
        group?: string;
    };
}

export interface ScriptFiles {
    preinstall?: string;
    postinstall?: string;
    preremove?: string;
    postremove?: string;
}

export interface NFPMConfig {
    name: string;
    arch: string;
    platform: string;
    version: string;
    release?: string;
    section: string;
    priority: string;
    maintainer: string;
    vendor?: string;
    homepage?: string;
    license?: string;
    description: string;
    depends?: string[];
    recommends?: string[];
    suggests?: string[];
    conflicts?: string[];
    replaces?: string[];
    provides?: string[];
    contents?: ContentFile[];
    scripts?: ScriptFiles;
}

// Create a custom YAML schema to preserve octal number format
const customYamlType = new yaml.Type('tag:yaml.org,2002:int', {
    kind: 'scalar',
    resolve: function(data) {
        return data !== null && (data === '0' || /^0[0-7]+$/.test(data) || /^[-+]?[1-9][0-9]*$/.test(data));
    },
    construct: function(data) {
        // Just return the original string to preserve format
        return data;
    }
});

const CUSTOM_SCHEMA = yaml.DEFAULT_SCHEMA.extend({ implicit: [customYamlType] });

export class ConfigGenerator {
    public static async generateNFPMConfig(configFile: string, contentFiles: ContentFile[]): Promise<void> {
        core.info('Generating NFPM configuration...');

        // Get required inputs directly
        const packageName = this.getRequiredInput('package-name');
        const packageDescription = this.getRequiredInput('package-description');
        const version = this.getRequiredInput('version');
        const maintainer = this.getRequiredInput('maintainer');

        // Get optional inputs with defaults
        const arch = core.getInput('arch') || 'amd64';
        const platform = core.getInput('platform') || 'linux';
        const release = core.getInput('release') || '1';
        const section = core.getInput('section') || 'default';
        const priority = core.getInput('priority') || 'optional';
        const vendor = core.getInput('vendor') || '';
        const homepage = core.getInput('homepage') || '';
        const license = core.getInput('license') || '';
        const depends = core.getInput('depends') || '';
        const recommends = core.getInput('recommends') || '';
        const suggests = core.getInput('suggests') || '';
        const conflicts = core.getInput('conflicts') || '';
        const replaces = core.getInput('replaces') || '';
        const provides = core.getInput('provides') || '';
        const scripts = core.getInput('scripts') || '';

        const config: NFPMConfig = {
            name: packageName,
            arch: arch,
            platform: platform,
            version: version,
            section: section,
            priority: priority,
            maintainer: maintainer,
            description: packageDescription
        };

        // Add optional fields if provided
        if (release && release !== '1') {
            config.release = release;
        }

        if (vendor) {
            config.vendor = vendor;
        }

        if (homepage) {
            config.homepage = homepage;
        }

        if (license) {
            config.license = license;
        }

        // Add dependency arrays if provided
        this.addDependencyArray(config, 'depends', depends);
        this.addDependencyArray(config, 'recommends', recommends);
        this.addDependencyArray(config, 'suggests', suggests);
        this.addDependencyArray(config, 'conflicts', conflicts);
        this.addDependencyArray(config, 'replaces', replaces);
        this.addDependencyArray(config, 'provides', provides);

        // Add content files if provided
        if (contentFiles.length > 0) {
            config.contents = contentFiles;
        }

        // Add scripts if provided
        if (scripts.trim()) {
            config.scripts = this.parseScripts(scripts);
        }

        // Write configuration file
        const yamlContent = yaml.dump(config, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
        });

        await fs.writeFile(configFile, yamlContent);

        core.info('Generated NFPM configuration:');
        core.info('==============================');
        core.info(yamlContent);
        core.info('==============================');
    }

    private static getRequiredInput(name: string): string {
        const value = core.getInput(name);
        if (!value) {
            throw new Error(`Required input '${name}' is missing`);
        }
        return value;
    }

    private static addDependencyArray(config: NFPMConfig, key: keyof NFPMConfig, input: string): void {
        if (input.trim()) {
            const deps = input
                .split(',')
                .map(dep => dep.trim())
                .filter(dep => dep);

            if (deps.length > 0) {
                (config as any)[key] = deps;
            }
        }
    }

    private static parseScripts(scriptsInput: string): ScriptFiles {
        try {
            const scripts = yaml.load(scriptsInput) as ScriptFiles;
            if (typeof scripts !== 'object' || scripts === null) {
                throw new Error('Scripts must be a YAML object');
            }

            // Validate script keys
            const validKeys = ['preinstall', 'postinstall', 'preremove', 'postremove'];
            for (const key of Object.keys(scripts)) {
                if (!validKeys.includes(key)) {
                    core.warning(`Unknown script key: ${key}. Valid keys are: ${validKeys.join(', ')}`);
                }
            }

            return scripts;
        } catch (error) {
            throw new Error(`Failed to parse scripts: ${(error as Error).message}`);
        }
    }
}

export class ContentFileParser {
    public static parse(contentsInput: string): ContentFile[] {
        if (!contentsInput.trim()) {
            return [];
        }

        const input = contentsInput.trim();

        // Try to parse as YAML first
        if (input.startsWith('-') || input.startsWith('contents:')) {
            return this.parseYamlFormat(input);
        }

        // Parse as key-value format
        return this.parseKeyValueFormat(input);
    }

    private static parseYamlFormat(yamlInput: string): ContentFile[] {
        try {
            let parsedYaml: any;

            // Handle both array format and object format
            // Use the custom schema to preserve number formats
            if (yamlInput.startsWith('contents:')) {
                parsedYaml = yaml.load(yamlInput, { schema: CUSTOM_SCHEMA }) as { contents: any[] };
                parsedYaml = parsedYaml.contents;
            } else {
                parsedYaml = yaml.load(yamlInput, { schema: CUSTOM_SCHEMA }) as any[];
            }

            if (!Array.isArray(parsedYaml)) {
                throw new Error('YAML contents must be an array');
            }

            const contentFiles = parsedYaml.map((file: any, index: number): ContentFile => {
                if (!file.src || !file.dst) {
                    throw new Error(`Content file at index ${index} must have 'src' and 'dst' properties`);
                }

                const type = file.type || 'file';
                if (!['file', 'dir', 'config', 'symlink'].includes(type)) {
                    throw new Error(`Invalid type "${type}" at index ${index}. Must be one of: file, dir, config, symlink`);
                }

                // Create the content file object
                const contentFile: ContentFile = {
                    src: file.src,
                    dst: file.dst,
                    type: type as 'file' | 'dir' | 'config' | 'symlink'
                };

                // Handle file_info
                if (file.mode !== undefined || file.owner || file.group || file.file_info) {
                    contentFile.file_info = {};

                    // Preserve mode exactly as it was in the YAML (string or number)
                    if (file.mode !== undefined) {
                        contentFile.file_info.mode = file.mode;
                    } else if (file.file_info?.mode !== undefined) {
                        contentFile.file_info.mode = file.file_info.mode;
                    }

                    contentFile.file_info.owner = file.owner || file.file_info?.owner;
                    contentFile.file_info.group = file.group || file.file_info?.group;
                }

                return contentFile;
            });

            core.info(`Parsed ${contentFiles.length} content files from YAML`);
            this.logContentFiles(contentFiles);

            return contentFiles;
        } catch (error) {
            throw new Error(`Failed to parse YAML contents: ${(error as Error).message}`);
        }
    }

    private static parseKeyValueFormat(input: string): ContentFile[] {
        const contentFiles: ContentFile[] = [];
        const lines = input.split('\n').map(line => line.trim()).filter(line => line);

        for (const line of lines) {
            const file = this.parseKeyValueLine(line);
            contentFiles.push(file);
        }

        core.info(`Parsed ${contentFiles.length} content files from key-value format`);
        this.logContentFiles(contentFiles);

        return contentFiles;
    }

    private static parseKeyValueLine(line: string): ContentFile {
        const file: ContentFile = {
            src: '',
            dst: '',
            type: 'file'
        };

        // Split by spaces but preserve quoted values
        const parts = line.match(/(\w+)=("([^"]*)"|'([^']*)'|[^\s]+)/g);

        if (!parts) {
            throw new Error(`Invalid key-value format: "${line}"`);
        }

        for (const part of parts) {
            const [key, value] = part.split('=', 2);
            const cleanValue = value.replace(/^["']|["']$/g, '');

            switch (key.toLowerCase()) {
                case 'src':
                    file.src = cleanValue;
                    break;
                case 'dst':
                    file.dst = cleanValue;
                    break;
                case 'mode':
                    if (!file.file_info) file.file_info = {};
                    file.file_info.mode = cleanValue.toString();
                    break;
                case 'owner':
                    if (!file.file_info) file.file_info = {};
                    file.file_info.owner = cleanValue;
                    break;
                case 'group':
                    if (!file.file_info) file.file_info = {};
                    file.file_info.group = cleanValue;
                    break;
                case 'type':
                    if (!['file', 'dir', 'config', 'symlink'].includes(cleanValue)) {
                        throw new Error(`Invalid type "${cleanValue}". Must be one of: file, dir, config, symlink`);
                    }
                    file.type = cleanValue as 'file' | 'dir' | 'config' | 'symlink';
                    break;
                default:
                    core.warning(`Unknown key "${key}" in content file definition`);
            }
        }

        if (!file.src || !file.dst) {
            throw new Error(`Content file must have both 'src' and 'dst' properties: "${line}"`);
        }

        return file;
    }

    private static logContentFiles(contentFiles: ContentFile[]): void {
        contentFiles.forEach(file => {
            const mode = file.file_info?.mode ? `, ${file.file_info.mode}` : '';
            const owner = file.file_info?.owner && file.file_info?.group ? `, ${file.file_info.owner}:${file.file_info.group}` : '';
            const type = file.type || 'file';
            core.info(`  ${file.src} -> ${file.dst} (${type}${mode}${owner})`);
        });
    }
}

export class FileValidator {
    public static async validateSourceFiles(contentFiles: ContentFile[]): Promise<void> {
        core.info('Validating source files...');

        for (const file of contentFiles) {
            try {
                await fs.access(file.src);
                core.info(`✅ Found: ${file.src}`);
            } catch (error) {
                throw new Error(`Source file not found: ${file.src}`);
            }
        }
    }
}