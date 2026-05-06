import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  uploadBuffer(buffer: Buffer, folder: string): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error, result) => {
          if (error || !result) reject(new Error(error?.message ?? 'Upload failed'));
          else resolve(result);
        },
      );
      Readable.from(buffer).pipe(stream);
    });
  }

  async deleteByUrl(url: string): Promise<void> {
    const publicId = this.extractPublicId(url);
    if (publicId) {
      await cloudinary.uploader.destroy(publicId);
    }
  }

  private extractPublicId(url: string): string {
    // https://res.cloudinary.com/cloud/image/upload/v1234567890/folder/file.jpg → "folder/file"
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
    return match?.[1] ?? '';
  }
}
