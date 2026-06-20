# S3 Bucket Policy for Image Access

## Problem
Images in notices were not visible because direct S3 URLs require authentication.

## Solution Implemented
✅ **Pre-signed URLs** - Added `generatePresignedUrl()` function that creates temporary authenticated URLs
✅ **Fallback URLs** - Multiple S3 URL formats for compatibility
✅ **Error Handling** - Shows placeholder image when images fail to load

## Required S3 Bucket Policy

Add this policy to your `tce-circular-raw-data` bucket:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::tce-circular-raw-data/*"
        },
        {
            "Sid": "AllowCognitoIdentity",
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::YOUR_ACCOUNT_ID:role/Cognito_tce-event-board-identity-poolAuth_Role"
            },
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::tce-circular-raw-data",
                "arn:aws:s3:::tce-circular-raw-data/*"
            ]
        }
    ]
}
```

## CORS Configuration

Set this CORS configuration in your S3 bucket:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "HEAD", "PUT", "POST"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
    }
]
```

## How It Works

1. **Pre-signed URLs**: Generate temporary authenticated URLs (valid for 1 hour)
2. **Error Handling**: Shows placeholder if image fails to load
3. **Multiple Formats**: Tries different S3 URL formats
4. **Logging**: Console shows which URL format is being used

## Test Images

Open browser console and look for:
- `Generated pre-signed URL for: [filename]`
- `S3 client not initialized, using direct URL` (if AWS credentials issue)
- Image error messages with specific details

The images should now be visible in both the notices grid and modal view!