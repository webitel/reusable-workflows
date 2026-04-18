"use strict";

const fs = require("fs");
const path = require("path");

const severityRank = {
  none: -1,
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const sarifLevel = {
  critical: "error",
  high: "error",
  moderate: "warning",
  low: "note",
  info: "note",
};

function getInput(name, fallback = "") {
  return process.env[`INPUT_${name.replace(/[- ]/g, "_").toUpperCase()}`] ?? fallback;
}

function appendOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  fs.appendFileSync(outputPath, `${name}=${value}\n`, "utf8");
}

function normalizeSeverity(raw) {
  const severity = String(raw || "").toLowerCase();
  return Object.prototype.hasOwnProperty.call(severityRank, severity) ? severity : "info";
}

function loadAuditReport(filename) {
  if (!fs.existsSync(filename)) {
    throw new Error(`Audit report not found: ${filename}`);
  }

  const raw = fs.readFileSync(filename, "utf8").trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function vulnerabilityMessage(vulnerability, packageName) {
  const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
  const details = via
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (!item || typeof item !== "object") {
        return "";
      }

      return item.title || item.url || item.name || "";
    })
    .filter(Boolean);

  if (details.length > 0) {
    return details.join("; ");
  }

  return `Known vulnerabilities detected in dependency ${packageName}.`;
}

function buildSarif(report) {
  const vulnerabilities = report && typeof report === "object" ? report.vulnerabilities || {} : {};
  const entries = Object.entries(vulnerabilities);

  const rules = entries.map(([packageName, vulnerability]) => {
    const severity = normalizeSeverity(vulnerability && vulnerability.severity);
    return {
      id: `npm-audit/${packageName}`,
      name: `npm-audit/${packageName}`,
      shortDescription: { text: `Vulnerable dependency: ${packageName}` },
      fullDescription: { text: vulnerabilityMessage(vulnerability || {}, packageName) },
      defaultConfiguration: { level: sarifLevel[severity] || "warning" },
      properties: {
        tags: ["security", "npm-audit", severity],
      },
    };
  });

  const results = entries.map(([packageName, vulnerability]) => {
    const severity = normalizeSeverity(vulnerability && vulnerability.severity);
    return {
      ruleId: `npm-audit/${packageName}`,
      level: sarifLevel[severity] || "warning",
      message: {
        text: `Dependency ${packageName} has known ${severity} vulnerabilities.`,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: "package-lock.json" },
            region: { startLine: 1 },
          },
        },
      ],
    };
  });

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "npm-audit",
            informationUri: "https://docs.npmjs.com/cli/v11/commands/npm-audit/",
            rules,
          },
        },
        results,
      },
    ],
  };
}

function detectMaxSeverity(report) {
  const vulnerabilities = report && typeof report === "object" ? report.vulnerabilities || {} : {};
  let maxSeverity = "none";

  for (const vulnerability of Object.values(vulnerabilities)) {
    const severity = normalizeSeverity(vulnerability && vulnerability.severity);
    if (severityRank[severity] > severityRank[maxSeverity]) {
      maxSeverity = severity;
    }
  }

  return maxSeverity;
}

function main() {
  const auditFile = getInput("audit-file");
  const sarifFile = getInput("sarif-file", "report.sarif");
  const failOn = normalizeSeverity(getInput("fail-on", "high"));

  const report = loadAuditReport(auditFile);
  const sarif = buildSarif(report);
  const maxSeverity = detectMaxSeverity(report);
  const resultCount = sarif.runs[0].results.length;
  const hasFailures = severityRank[maxSeverity] >= severityRank[failOn] && severityRank[failOn] >= 0;

  fs.mkdirSync(path.dirname(sarifFile), { recursive: true });
  fs.writeFileSync(sarifFile, JSON.stringify(sarif, null, 2), "utf8");

  appendOutput("has-failures", hasFailures ? "true" : "false");
  appendOutput("max-severity", maxSeverity);
  appendOutput("result-count", String(resultCount));
}

main();
