/**
 * 사진 파일을 가운데 기준 정사각형으로 잘라 size×size JPEG 로 줄인다 (프로필 사진 올리기 전).
 * 큰 휴대폰 사진도 수십 KB 로 줄어 저장소·화면 로딩이 가볍다. 읽을 수 없는 파일이면 오류를 던진다.
 */
export async function squareJpeg(file: Blob, size = 256, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image_load_failed'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('image_empty');
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_unavailable');
    // 투명 PNG 가 검게 나오지 않게 흰 바탕을 먼저 칠한다
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', quality)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
