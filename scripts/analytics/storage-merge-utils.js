export const toNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;
export const minPositive = (...vs) => Math.min(...vs.map(toNum).filter(v => v > 0)) || 0;

export const getBackupConflictPolicy = () => {
  try {
    const v = localStorage.getItem('backup:conflict_policy:v1');
    return ['ask', 'latest', 'trash'].includes(v) ? v : 'ask';
  } catch {
    return 'ask';
  }
};

export default { toNum, minPositive, getBackupConflictPolicy };
