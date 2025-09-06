import * as core from '@actions/core';
import * as yaml from "js-yaml";
import {promises as fs} from "fs";

export interface ContentFile {
    src: string;
    dst: string;
    type?: 'file' | 'dir' | 'config' | 'symlink';
    file_info?: {
        mode?: number;
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
    prerelease?: string;
    version_metadata?: string;
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
    umask?: number;
    contents?: ContentFile[];
    scripts?: ScriptFiles;
}

export class ConfigGenerator {
    public static async generateNFPMConfig(configFile: string, contentFiles: ContentFile[]): Promise<void> {
        core.startGroup('Generating nFPM configuration...');
        const config: NFPMConfig = {
            name: core.getInput('package-name'),
            description: core.getInput('package-description'),
            vendor: core.getInput('vendor') || '',
            maintainer: core.getInput('maintainer'),
            homepage: core.getInput('homepage') || '',
            license: core.getInput('license') || '',

            arch: core.getInput('arch') || 'amd64',
            platform: core.getInput('platform') || 'linux',
            section: core.getInput('section') || 'default',
            priority: core.getInput('priority') || 'optional',

            version: core.getInput('version'),
            release: core.getInput('release') || '1',
            prerelease: core.getInput('prerelease') || '',
            version_metadata: core.getInput('version-metadata') || '',

            umask: parseInt(core.getInput('umask'), 8) || 0o002
        };

        const depends = core.getInput('depends') || '';
        const recommends = core.getInput('recommends') || '';
        const suggests = core.getInput('suggests') || '';
        const conflicts = core.getInput('conflicts') || '';
        const replaces = core.getInput('replaces') || '';
        const provides = core.getInput('provides') || '';
        const scripts = core.getInput('scripts') || '';

        // Add dependency arrays if provided
        this.addDependencyArray(config, 'depends', depends);
        this.addDependencyArray(config, 'recommends', recommends);
        this.addDependencyArray(config, 'suggests', suggests);
        this.addDependencyArray(config, 'conflicts', conflicts);
        this.addDependencyArray(config, 'replaces', replaces);
        this.addDependencyArray(config, 'provides', provides);

        if (contentFiles.length > 0) {
            config.contents = contentFiles;
        }

        if (scripts.trim()) {
            config.scripts = this.parseScripts(scripts);
        }

        // Use the string replacement method for reliable unquoted octal values
        const yamlContent = objectToYamlWithOctalStringReplace(
            config,
            ['umask', 'mode'], // Fields to convert to octal
            { includePrefix: true } // Include '0o' prefix
        );

        await fs.writeFile(configFile, yamlContent);

        core.info('==============================');
        core.info(yamlContent);
        core.info('==============================');
        core.endGroup()
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
        const input = contentsInput.trim();
        if (!input) {
            return [];
        }

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
            dst: ''
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
                    file.file_info.mode = parseInt(cleanValue, 8);  // converts '0644' to 420
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

function objectToYamlWithOctalStringReplace(
    obj: any,
    fieldNames: string[],
    options?: { includePrefix?: boolean }
): string {
    const { includePrefix = true } = options || {};

    // Create a map of original values to octal strings
    const octalMap = new Map<number, string>();
    const placeholderMap = new Map<number, string>();

    function collectOctalValues(current: any): void {
        if (typeof current === 'object' && current !== null) {
            for (const [key, value] of Object.entries(current)) {
                if (fieldNames.includes(key) && typeof value === 'number' && Number.isInteger(value)) {
                    const num = value as number;
                    if (!octalMap.has(num)) {
                        const octalValue = num.toString(8);
                        const finalValue = includePrefix ? `0o${octalValue}` : octalValue;
                        octalMap.set(num, finalValue);
                        // Create a unique placeholder that won't be quoted
                        placeholderMap.set(num, `__OCTAL_${num}_PLACEHOLDER__`);
                    }
                } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    collectOctalValues(value);
                } else if (Array.isArray(value)) {
                    value.forEach(item => {
                        if (typeof item === 'object' && item !== null) {
                            collectOctalValues(item);
                        }
                    });
                }
            }
        }
    }

    // First pass: collect all octal values
    collectOctalValues(obj);

    // Second pass: replace with placeholders
    const transformedObj = JSON.parse(JSON.stringify(obj));
    function replacePlaceholders(current: any): void {
        if (typeof current === 'object' && current !== null) {
            for (const [key, value] of Object.entries(current)) {
                if (fieldNames.includes(key) && typeof value === 'number' && Number.isInteger(value)) {
                    const placeholder = placeholderMap.get(value as number);
                    if (placeholder) {
                        current[key] = placeholder;
                    }
                } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    replacePlaceholders(value);
                } else if (Array.isArray(value)) {
                    value.forEach(item => {
                        if (typeof item === 'object' && item !== null) {
                            replacePlaceholders(item);
                        }
                    });
                }
            }
        }
    }

    replacePlaceholders(transformedObj);

    // Generate YAML
    let yamlContent = yaml.dump(transformedObj, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false
    });

    // Replace placeholders with actual octal values
    placeholderMap.forEach((placeholder, originalValue) => {
        const octalValue = octalMap.get(originalValue);
        if (octalValue) {
            // Replace both quoted and unquoted versions
            yamlContent = yamlContent.replace(new RegExp(`["']?${placeholder}["']?`, 'g'), octalValue);
        }
    });

    return yamlContent;
}