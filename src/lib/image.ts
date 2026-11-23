/** 縮成指定寬度的 JPEG data URL。IG 的圖片網址幾天後會過期，存這份才看得到 */
export async function toJpeg(blob: Blob, width: number): Promise<string> {
  const img = await createImageBitmap(blob, { resizeWidth: width, resizeQuality: 'medium' })
  const canvas = new OffscreenCanvas(img.width, img.height)
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 })
  return new Promise<string>((ok, fail) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = fail
    r.readAsDataURL(jpeg)
  })
}
