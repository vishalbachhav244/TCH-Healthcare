import { appointmentPassPattern } from '../domain/scheduling';

export async function loadAppointmentPassDecoder() {
  const { default: decode } = await import('jsqr');
  return ({ data, width, height }: ImageData) => {
    const value = decode(data, width, height)?.data;
    return value && appointmentPassPattern.test(value) ? value : undefined;
  };
}

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
    const decode = await loadAppointmentPassDecoder();
    const value = decode(pixels);
    if (!value) throw new Error();
    return value;
  } finally {
    image.close();
  }
}
