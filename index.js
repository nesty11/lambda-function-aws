const sharp = require('sharp');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({ region: 'us-east-1' });
const imageWidthSize = 300;

exports.handler = async (event) => {
    const bucket = event.Records[0].s3.bucket.name;
    let key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

    if (!key) {
        console.error(`S3 Key ${key} is undefined.`);
        return {
            statusCode: 400,
            body: JSON.stringify({ error: `S3 Key ${key} is undefined.` }),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    if (key.includes('_resized')) {
        return {
            statusCode: 204,
            body: JSON.stringify({ message: 'Image is already processed. Exiting.' }),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }

    try {
        const originalImage = await s3Client.send(
            new GetObjectCommand({ Bucket: bucket, Key: key })
        );

        const imageBuffer = await streamToBuffer(originalImage.Body);

        const imageMetadata = await sharp(imageBuffer).metadata();

        if (!imageMetadata || !imageMetadata.width) {
            console.log('Image is lacking necessary metadata');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Image is lacking necessary metadata' }),
                headers: {
                    'Content-Type': 'application/json',
                },
            };
        }

        const imageWidth = parseInt(imageMetadata.width, 10);
        if (imageWidth <= imageWidthSize) {
            console.log('Image is already the proper size.');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Image is already the proper size.' }),
                headers: {
                    'Content-Type': 'application/json',
                },
            };
        }

        const resizedImage = await sharp(imageBuffer)
            .resize({ width: imageWidthSize })
            .toBuffer();

        const resizedKey = key.replace('original-images/', 'resized-images/').replace('.', '_resized.');
        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: resizedKey,
                Body: resizedImage,
                ContentType: originalImage.ContentType || 'image/jpeg',
            })
        );

        console.log(`Resized Image ${resizedKey} has been uploaded`);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Resized Image ${resizedKey} has been uploaded` }),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    } catch (error) {
        console.error('Error processing image: ', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
            headers: {
                'Content-Type': 'application/json',
            },
        };
    }
};

const streamToBuffer = async (stream) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
};
