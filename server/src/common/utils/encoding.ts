/**
 * 文件名编码归一化
 *
 * 背景:
 *   HTTP multipart/form-data 上传文件时, 浏览器会把 UTF-8 文件名按 ISO-8859-1(latin-1) 塞进
 *   Content-Disposition: filename="..." 这个 header value 里. Node/multer 按 latin-1 读到字符串后,
 *   就会产生 "开发文档.md → å¼åææ¡£.md" 这种经典 mojibake.
 *   现代浏览器会用 filename*=UTF-8''xxx( RFC 5987), multer 能自动正确解码, 不会乱码.
 *
 * 本函数做法:
 *   检测是否含 Latin-1 补充区字符 (U+0080~U+00FF), 这些是 UTF-8 多字节被按 latin-1 解码的典型特征;
 *   如果命中, 用 Buffer.from(name, 'latin1').toString('utf-8') 还原, 还原后若替换字符更少就采纳.
 *
 * @param name multer 拿到的 file.originalname
 */
export function normalizeFilename(name: string | null | undefined): string {
  if (!name) return '';
  // 纯 ASCII 无需处理
  if (/^[\x00-\x7F]*$/.test(name)) return name;
  // 已含 CJK 且无 Latin-1 补充区字符 → 已是正确 UTF-8
  const hasCJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(name);
  const hasLatin1Sup = /[\u0080-\u00ff]/.test(name);
  if (!hasLatin1Sup) return name; // 有 CJK 但无 latin1 乱码特征, 直接返回
  if (hasCJK && !hasLatin1Sup) return name;

  try {
    const restored = Buffer.from(name, 'latin1').toString('utf-8');
    // 替换字符 U+FFFD 越少越好
    const origRepl = (name.match(/\uFFFD/g) || []).length;
    const restRepl = (restored.match(/\uFFFD/g) || []).length;
    if (restRepl > origRepl) return name;
    // 还原后仍含 Latin-1 补充区字符 → 转换失败
    if (/[\u0080-\u00ff]/.test(restored)) return name;
    return restored;
  } catch {
    return name;
  }
}
