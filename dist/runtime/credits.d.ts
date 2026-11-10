import type { CliRun } from './agy-cli.js';
import type { CreditsSnapshot } from './quota.js';
/** 按实际无头回包读取 command.data；金额缺失、负数和精度溢出都不是零。 */
export declare function parseAgyCredits(value: unknown): Pick<CreditsSnapshot, 'remainingCredits' | 'planName'>;
export declare function fetchAgyCredits(run: CliRun, cliPath: string): Promise<CreditsSnapshot>;
