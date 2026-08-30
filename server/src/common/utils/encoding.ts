/**
 * 文件名编码归一化
 *
 * 背景:
 *   HTTP multipart/form-data 上传文件时, 老的浏览器/客户端会把 UTF-8 文件名按 ISO-8859-1(latin-1) 塞进
 *   Content-Disposition: filename="..." 这个 header value 里. Node/multer 按 latin-1 读到字符串后,
 *   就会产生 "开发文档.md → å¼åææ¡£.md" 这种经典 mojibake.
 *   现代浏览器会用 filename*=UTF-8''xxx( RFC 5987), multer 能自动正确解码, 不会乱码.
 *
 * 本函数做法:
 *   先判断是否有 "latin1 被误当 UTF-8 显示" 的特征 (出现 Ã/å/¼ 等字符, 或 0xFFFD 替换字符比例高);
 *   如果命中特征, 用 Buffer.from(name, 'latin1').toString('utf-8') 还原, 还原后若替换字符比例更低就采纳, 否则原样返回.
 *
 * @param name multer 拿到的 file.originalname
 */
export function normalizeFilename(name: string | null | undefined): string {
  if (!name) return '';
  // 1) 先判断是否已经是干净的中文 (ASCII + CJK + 常规标点): 若没包含任何乱码特征字符, 直接返回
  // 乱码特征字节: 把 UTF-8 多字节首字节 (0xC0-0xFF) 当 latin-1 显示时对应字符:
  //   U+00C2 Â  U+00C3 Ã  U+00C4 Ä  U+00E5 å  U+00BC ¼  U+0080-PAD 控制字符 (€ 等少见字符)
  const hasMojibakeSigns = /[ÃÂÄå¼¤ðñòóôõö÷øùúûüýþÿ]/.test(name);
  if (!hasMojibakeSigns) {
    return name;
  }

  try {
    const restored = Buffer.from(name, 'latin1').toString('utf-8');
    // 替换字符 U+FFFD 越少越好, 如果还原后替换字符比原来更多, 说明还原错了
    const origRepl = (name.match(/\uFFFD/g) || []).length;
    const restRepl = (restored.match(/\uFFFD/g) || []).length;
    // 如果还原后仍然含大量 ÃÂ 之类特征, 说明本来就是这些字符组成的文件名, 不要硬转
    const stillBad = /[ÃÂÄå¼¤ðñò]/.test(restored);
    if (stillBad || restRepl > origRepl) {
      return name;
    }
    // 还原结果含可打印字符比例足够高即采纳
    return restored;
  } catch {
    return name;
  }
}
