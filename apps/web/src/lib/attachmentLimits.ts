export function findOversizedAttachment(files: readonly File[], maxMb: number): File | undefined {
  if (!Number.isFinite(maxMb) || maxMb <= 0) throw new RangeError('Invalid attachment size limit')
  return files.find((file) => file.size > maxMb * 1024 * 1024)
}
