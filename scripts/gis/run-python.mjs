import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const localPython = path.join(root, '.venv-data', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const python = existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3'
const result = spawnSync(python, ['scripts/gis/validate_data.py', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' })
if (result.error) console.error('Cần Python và công cụ GIS. Xem docs/data-pipeline.md.', result.error.message)
process.exit(result.status ?? 1)
