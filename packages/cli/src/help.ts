export const mainHelp = `rosetta: RPA migration accelerator (A360 → IBM RPA)

Usage:
  rosetta <command> [options]

Commands:
  assess <input-dir>     Assess a folder of A360 exports and write the report
  preview-report         Render the report from SYNTHETIC data, to review the design
  help [command]         Show help for a command

Options:
  -h, --help             Show help
  -v, --version          Show the version

Exit codes:
  0 ok · 1 internal error · 2 usage error · 3 invalid profile · 4 input problem · 5 not implemented yet
`;

const profileOptions = `Profile options (layered: built-in defaults → company → client → project):
  --profile <file>          Company standards profile (YAML)
  --client-profile <file>   Client standards profile (YAML)
  --overrides <file>        Project overrides, rosetta.project.yaml`;

export const assessHelp = `rosetta assess <input-dir> [options]

Assesses every A360 export in <input-dir>: command coverage, complexity and
effort sizing, and source quality. Writes report.html and report.json.

Options:
  --out <dir>               Output folder (default: ./rosetta-report)
${profileOptions}
  -h, --help                Show this help

Input: raw A360 bot files (*.json, e.g. bot.json saved from the Control Room).
A file named bot.json takes its folder's name. Export zips are not supported yet.
`;

export const previewHelp = `rosetta preview-report [options]

Renders the assessment report from hand-built SYNTHETIC data, so the layout
and brand can be reviewed before real exports exist. The report carries a
"Synthetic data" banner. Profile options apply, so you can see their effect.

Options:
  --out <dir>               Output folder (default: ./out/preview)
${profileOptions}
  -h, --help                Show this help
`;
