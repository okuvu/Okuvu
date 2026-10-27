import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../../../../.env') });

process.env.GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash';
process.env.GEMINI_PRO_MODEL = 'gemini-2.5-flash';
process.env.LLM_PROVIDER = 'gemini';
process.env.OPENROUTER_MODEL = 'meta-llama/llama-3.1-8b-instruct';
