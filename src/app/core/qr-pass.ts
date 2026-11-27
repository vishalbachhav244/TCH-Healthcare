import { appointmentPassPattern } from '../domain/scheduling';

export async function readAppointmentPass(file: File) {
  if (file.size > 2_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error();
  const image = await createImageBitmap(file, { resizeWidth: 600 });
  try {
    if (image.height > 1200) throw new Error();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error();
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const { default: decode } = await import('jsqr');
    const value = decode(pixels.data, pixels.width, pixels.height)?.data;
    if (!value || !appointmentPassPattern.test(value)) throw new Error();
    return value;
  } finally {
    image.close();
  }
}
