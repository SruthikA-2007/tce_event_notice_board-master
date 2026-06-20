# AWS Setup Guide for TCE Event Notice Board

## Prerequisites
- AWS Account with S3 buckets already created:
  - `tce-circular-raw-data`
  - `tce-circular-text-data`
- Lambda functions deployed:
  - `doc-textrat`
  - `top3search`

## Step 1: Create Cognito Identity Pool

1. Go to AWS Cognito Console
2. Click "Manage Identity Pools"
3. Create new identity pool:
   - Name: `tce-event-board-identity-pool`
   - Enable unauthenticated access: ✓
4. Note the Identity Pool ID (format: `ap-south-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

## Step 2: Configure IAM Roles

### For Unauthenticated Users:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::tce-circular-raw-data",
                "arn:aws:s3:::tce-circular-raw-data/*",
                "arn:aws:s3:::tce-circular-text-data",
                "arn:aws:s3:::tce-circular-text-data/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "lambda:InvokeFunction"
            ],
            "Resource": [
                "arn:aws:lambda:ap-south-1:YOUR_ACCOUNT_ID:function:doc-textrat",
                "arn:aws:lambda:ap-south-1:YOUR_ACCOUNT_ID:function:top3search"
            ]
        }
    ]
}
```

## Step 3: Configure S3 CORS

Add CORS configuration to both S3 buckets:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"]
    }
]
```

## Step 4: Update JavaScript Configuration

Replace in `script.js`:
```javascript
COGNITO_IDENTITY_POOL_ID: 'ap-south-1:YOUR_ACTUAL_IDENTITY_POOL_ID'
```

## Step 5: API Gateway Setup (if not done)

1. Create REST API in API Gateway
2. Create resource and method for chatbot
3. Integrate with `top3search` Lambda
4. Enable CORS
5. Deploy API and note the endpoint URL

## Security Notes

- Use authenticated access for production
- Implement proper user authentication
- Add request validation
- Monitor usage and costs
- Consider using pre-signed URLs for uploads

## Testing

1. Open browser console
2. Check for AWS initialization messages
3. Test file upload functionality
4. Test chatbot queries
5. Verify S3 bucket contents