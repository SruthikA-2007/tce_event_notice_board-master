// AWS Configuration Fixes

// 1. Add AWS SDK script to HTML head (add this to your HTML file):
/*
<script src="https://sdk.amazonaws.com/js/aws-sdk-2.1.24.min.js"></script>
*/

// 2. Enhanced AWS initialization with better error handling
function initializeAWS() {
    try {
        // Configure AWS SDK with proper error handling
        AWS.config.update({
            region: CONFIG.AWS_REGION,
            credentials: new AWS.CognitoIdentityCredentials({
                IdentityPoolId: CONFIG.COGNITO_IDENTITY_POOL_ID
            })
        });
        
        // Initialize clients
        s3Client = new AWS.S3({
            apiVersion: '2006-03-01',
            params: { Bucket: CONFIG.S3_BUCKET_NAME }
        });
        
        lambdaClient = new AWS.Lambda({
            apiVersion: '2015-03-31'
        });
        
        // Test credentials
        AWS.config.credentials.get((err) => {
            if (err) {
                console.error('AWS credentials error:', err);
                showToast('AWS authentication failed', 'error');
            } else {
                console.log('AWS SDK initialized successfully');
            }
        });
        
    } catch (error) {
        console.error('AWS initialization error:', error);
        showToast('Failed to initialize AWS services', 'error');
    }
}

// 3. Enhanced S3 upload with better error handling
async function uploadToS3(file, formData) {
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    
    try {
        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            throw new Error('File size must be less than 10MB');
        }
        
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            throw new Error('Only JPEG, PNG, GIF, and PDF files are allowed');
        }
        
        const timestamp = new Date().getTime();
        const fileName = `${formData.get('category')}_${timestamp}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        const uploadParams = {
            Bucket: CONFIG.S3_BUCKET_NAME,
            Key: fileName,
            Body: file,
            ContentType: file.type,
            ACL: 'public-read', // Make file publicly readable
            Metadata: {
                'title': formData.get('title') || 'Untitled',
                'category': formData.get('category') || 'general',
                'priority': formData.get('priority') || 'normal',
                'event-date': formData.get('eventDate'),
                'uploaded-by': currentUser.email,
                'upload-date': new Date().toISOString()
            }
        };
        
        const upload = s3Client.upload(uploadParams);
        
        upload.on('httpUploadProgress', (progress) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            if (progressFill) progressFill.style.width = `${percent}%`;
            if (progressPercent) progressPercent.textContent = `${percent}%`;
        });
        
        const result = await upload.promise();
        console.log('File uploaded successfully:', result.Location);
        
        // Trigger text extraction
        try {
            await triggerTextExtraction(fileName);
        } catch (extractError) {
            console.warn('Text extraction failed:', extractError);
            // Don't fail the upload if text extraction fails
        }
        
        return fileName;
        
    } catch (error) {
        console.error('S3 upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
    }
}

// 4. Enhanced chatbot with better error handling and CORS support
async function callChatbotAPI(query) {
    try {
        const response = await fetch(CONFIG.API_GATEWAY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors', // Enable CORS
            body: JSON.stringify({
                query: query,
                user_email: currentUser.email,
                timestamp: new Date().toISOString()
            })
        });
        
        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Handle different response formats
        if (data.body) {
            const bodyData = typeof data.body === 'string' ? JSON.parse(data.body) : data.body;
            return bodyData.response || bodyData.message || 'No response available';
        }
        
        return data.response || data.message || 'Sorry, I could not process your request.';
        
    } catch (error) {
        console.error('Chatbot API error:', error);
        
        // Enhanced fallback responses
        const responses = getSmartFallbackResponse(query);
        return responses;
    }
}

// 5. Smart fallback responses for chatbot
function getSmartFallbackResponse(query) {
    const lowerQuery = query.toLowerCase();
    
    const responses = {
        'today': `Here are today's events: ${getTodayEvents()}`,
        'tomorrow': `Tomorrow's events: ${getTomorrowEvents()}`,
        'technical': 'Check the Technical category in notices for upcoming tech events and competitions.',
        'cultural': 'Browse Cultural events in the notices section for festivals and celebrations.',
        'exam': 'Examination schedules and important dates are available in the notices section.',
        'deadline': 'Check recent notices for submission deadlines and important dates.',
        'contact': 'For queries, contact your department office or check the college website.',
        'help': 'I can help you find information about college events, notices, and schedules. Try asking about "today\'s events" or "technical events".'
    };
    
    for (const [key, value] of Object.entries(responses)) {
        if (lowerQuery.includes(key)) {
            return value;
        }
    }
    
    return 'I\'m having trouble connecting to the server. Please check the notices section or try again later.';
}

function getTodayEvents() {
    const today = new Date().toDateString();
    const todayNotices = notices.filter(n => {
        const eventDate = n.eventDate ? new Date(n.eventDate).toDateString() : null;
        return eventDate === today;
    });
    
    if (todayNotices.length === 0) {
        return 'No events scheduled for today.';
    }
    
    return todayNotices.map(n => n.title).join(', ');
}

function getTomorrowEvents() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toDateString();
    
    const tomorrowNotices = notices.filter(n => {
        const eventDate = n.eventDate ? new Date(n.eventDate).toDateString() : null;
        return eventDate === tomorrowStr;
    });
    
    if (tomorrowNotices.length === 0) {
        return 'No events scheduled for tomorrow.';
    }
    
    return tomorrowNotices.map(n => n.title).join(', ');
}