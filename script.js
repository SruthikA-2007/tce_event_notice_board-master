// TCE Event Notice Board - JavaScript

// Global Variables
let currentUser = null;
let notices = [];
let volunteers = [];
let isLoading = false;
let isUploading = false;

// Configuration
const CONFIG = {
    // Google OAuth Configuration (You'll need to replace these)
    GOOGLE_CLIENT_ID: '254105195689-03h0srrmlprvn5mrs99jq9e81u30fn11.apps.googleusercontent.com',

    // AWS Configuration
    AWS_REGION: 'ap-south-1',
    API_GATEWAY_URL: 'https://jng9fg7mra.execute-api.ap-south-1.amazonaws.com/default/top3search',
    USE_MOCK_CHATBOT: false, // Disabled - only use real S3 data
    S3_BUCKET_NAME: 'tce-circular-raw-data',
    S3_TEXT_BUCKET_NAME: 'tce-circular-text-data',

    COGNITO_IDENTITY_POOL_ID: 'ap-south-1:1c91f78d-75bc-4cc4-8406-e42677cf87a6',

    // Lambda Function Names
    LAMBDA_DOC_TEXTRACT: 'doc-textract',
    LAMBDA_TOP3_SEARCH: 'top3search',

    // App Configuration
    APP_NAME: 'TCE Event Notice Board',
    COLLEGE_DOMAIN: 'tce.edu',
    STUDENT_DOMAIN: 'student.tce.edu',
    ADMIN_DOMAIN: 'tce.edu',

    // Storage Keys
    STORAGE_KEYS: {
        USER: 'tce_event_user',
        NOTICES: 'tce_event_notices',
        VOLUNTEERS: 'tce_event_volunteers'
    }
};

// AWS SDK Configuration
let s3Client = null;
let lambdaClient = null;

function generatePresignedUrl(key) {
    // Generates a secure, temporary URL. 
    // This is now called on every render to ensure it NEVER expires for the user.
    try {
        if (!s3Client) return getPublicS3Url(key);

        const params = {
            Bucket: CONFIG.S3_BUCKET_NAME,
            Key: key,
            Expires: 86400 // 24 hours
        };

        return s3Client.getSignedUrl('getObject', params);
    } catch (error) {
        console.error('URL Generation error:', error);
        return getPublicS3Url(key);
    }
}

function getFreshImageUrl(notice) {
    const s3Key = notice.s3Key || notice.id;
    if (s3Key && (s3Key.startsWith('events/') || s3Key.includes('/') || s3Key.startsWith('academic_') || s3Key.startsWith('general_'))) {
        return generatePresignedUrl(s3Key);
    }
    return notice.imageUrl;
}

// Enhanced public URL generation with multiple fallback strategies
function getPublicS3Url(key) {
    // Try different S3 URL formats and test which one works
    const urls = [
        `https://${CONFIG.S3_BUCKET_NAME}.s3.${CONFIG.AWS_REGION}.amazonaws.com/${key}`,
        `https://s3.${CONFIG.AWS_REGION}.amazonaws.com/${CONFIG.S3_BUCKET_NAME}/${key}`,
        `https://${CONFIG.S3_BUCKET_NAME}.s3.amazonaws.com/${key}`,
        `https://${CONFIG.S3_BUCKET_NAME}.s3.${CONFIG.AWS_REGION}.amazonaws.com/${key}?v=${Date.now()}` // Cache-busting
    ];

    console.log('🔗 Testing multiple URL formats for:', key);

    // Return the first URL (will be tested with fallbacks later)
    return urls[0];
}
// Initialize AWS SDK
function initializeAWS() {
    // Configure AWS SDK
    AWS.config.update({
        region: CONFIG.AWS_REGION,
        credentials: new AWS.CognitoIdentityCredentials({
            IdentityPoolId: CONFIG.COGNITO_IDENTITY_POOL_ID
        })
    });

    // Initialize S3 and Lambda clients
    s3Client = new AWS.S3();
    lambdaClient = new AWS.Lambda();
}

// Function to manually check volunteer status (can be called from browser console)
window.checkVolunteerStatus = function (email = 'sruthikaks@student.tce.edu') {
    const volunteers = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS) || '[]');
    const userVolunteer = volunteers.find(v => v.email === email);

    console.log('🔍 Checking volunteer status for:', email);
    console.log('📊 All volunteers:', volunteers);
    console.log('👤 User volunteer data:', userVolunteer);

    if (userVolunteer) {
        console.log('✅ Status:', userVolunteer.status);
        console.log('📅 Applied:', userVolunteer.appliedAt);
        console.log('✅ Approved:', userVolunteer.approvedAt);
    } else {
        console.log('❌ No volunteer record found');
    }

    return userVolunteer;
};

// Manual function to grant volunteer access (can be called from browser console)
window.grantVolunteerAccess = function (email = 'sruthikaks@student.tce.edu') {
    const volunteers = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS) || '[]');
    const existingVolunteer = volunteers.find(v => v.email === email);

    if (existingVolunteer) {
        // Update existing volunteer to approved
        const updatedVolunteers = volunteers.map(v => {
            if (v.email === email) {
                return { ...v, status: 'approved', approvedAt: new Date().toISOString() };
            }
            return v;
        });
        localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(updatedVolunteers));
        console.log('✅ Volunteer access granted for:', email);
    } else {
        // Create new approved volunteer
        const newVolunteer = {
            id: 'manual_volunteer_' + Date.now(),
            name: 'Test User',
            email: email,
            rollNumber: 'MANUAL001',
            department: 'Computer Science Engineering',
            year: '3rd Year',
            club: 'Technical Club',
            reason: 'Manual volunteer access for testing',
            status: 'approved',
            appliedAt: new Date().toISOString(),
            approvedAt: new Date().toISOString(),
            approvedBy: 'manual_grant',
            rejectionReason: null
        };
        volunteers.push(newVolunteer);
        localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(volunteers));
        console.log('✅ New volunteer access created for:', email);
    }

    return window.checkVolunteerStatus(email);
};

// Debug function to reset upload state (can be called from browser console)
window.resetUploadState = function () {
    console.log('🔄 Resetting upload state...');
    volunteerFormsSetup = false;
    isUploading = false;
    uploadEventPoster.callCount = 0;

    // Clear any existing event listeners from upload form
    const uploadForm = document.getElementById('volunteerUploadForm');
    if (uploadForm) {
        const newForm = uploadForm.cloneNode(true);
        uploadForm.parentNode.replaceChild(newForm, uploadForm);
        console.log('🔧 Upload form reset');
    }

    console.log('✅ Upload state reset completed');
};

// Debug function to check metadata storage buckets (can be called from browser console)
window.checkMetadataBuckets = function () {
    console.log('🔍 Checking metadata storage configuration:');
    console.log('📁 Raw files bucket:', CONFIG.S3_BUCKET_NAME);
    console.log('📝 Metadata bucket:', CONFIG.S3_TEXT_BUCKET_NAME);
    console.log('🤖 Lambda function:', CONFIG.LAMBDA_DOC_TEXTRACT);
    console.log('');
    console.log('📋 Expected storage pattern:');
    console.log('  Images/PDFs →', CONFIG.S3_BUCKET_NAME, '(NO metadata attached)');
    console.log('  JSON metadata →', CONFIG.S3_TEXT_BUCKET_NAME, '(complete event details)');
    console.log('  Extracted text →', CONFIG.S3_TEXT_BUCKET_NAME, '(OCR results)');
    console.log('');
    console.log('🔧 To check if Lambda is working, upload an image and watch console logs');
};

// Debug function to test Lambda configuration (can be called from browser console)
window.testTextExtraction = function (testFileKey = 'test-image.jpg') {
    console.log('🧪 Testing text extraction Lambda function...');
    console.log('📁 Test file:', testFileKey);
    console.log('📁 Source bucket:', CONFIG.S3_BUCKET_NAME);
    console.log('📝 Target bucket:', CONFIG.S3_TEXT_BUCKET_NAME);
    console.log('🤖 Lambda function:', CONFIG.LAMBDA_DOC_TEXTRACT);

    const testEventData = {
        eventId: 'test_' + Date.now(),
        title: 'Test OCR Extraction',
        description: 'This is a test for OCR text extraction',
        category: 'test',
        eventDate: new Date().toISOString().split('T')[0],
        priority: 'normal'
    };

    triggerTextExtraction(testFileKey, testEventData, (err, result) => {
        if (err) {
            console.error('❌ Test failed:', err);
        } else {
            console.log('✅ Test completed:', result);
            console.log('🔍 Check text-data bucket for:', `${testEventData.eventId}.txt`);
        }
    });
};

// Debug function to check Lambda client status
window.checkLambdaClient = function () {
    console.log('🔍 Checking Lambda client status...');
    console.log('🤖 Lambda client:', !!lambdaClient);
    console.log('📋 Lambda function name:', CONFIG.LAMBDA_DOC_TEXTRACT);
    console.log('🌍 AWS Region:', CONFIG.AWS_REGION);

    if (lambdaClient) {
        console.log('✅ Lambda client is initialized');
        console.log('🔧 Try: testTextExtraction("your-file-key")');
    } else {
        console.log('❌ Lambda client is NOT initialized');
        console.log('🔧 Check AWS configuration and permissions');
    }
};

// Debug function to manually check text files in bucket
window.listTextFiles = function () {
    console.log('📂 Listing files in text-data bucket:', CONFIG.S3_TEXT_BUCKET_NAME);

    if (!s3Client) {
        console.log('❌ S3 client not initialized');
        return;
    }

    const params = {
        Bucket: CONFIG.S3_TEXT_BUCKET_NAME,
        MaxKeys: 50
    };

    s3Client.listObjectsV2(params, (err, data) => {
        if (err) {
            console.error('❌ Error listing files:', err);
            if (err.code === 'AccessDeniedException') {
                console.log('🔑 No access to bucket - check S3 permissions');
            } else if (err.code === 'NoSuchBucket') {
                console.log('🪣 Bucket does not exist - create bucket:', CONFIG.S3_TEXT_BUCKET_NAME);
            }
        } else {
            console.log('📊 Found', data.Contents.length, 'files in', CONFIG.S3_TEXT_BUCKET_NAME);
            if (data.Contents.length === 0) {
                console.log('📭 Bucket is empty - this explains why no OCR text is stored!');
                console.log('💡 ACTION NEEDED: Fix Lambda function to create text files');
            } else {
                data.Contents.forEach(obj => {
                    console.log(`  📄 ${obj.Key} (${obj.Size} bytes, ${obj.LastModified})`);
                });
            }
        }
    });
};

// Check both buckets to compare
window.compareBuckets = function () {
    console.log('🔍 Comparing bucket contents...');
    console.log('');

    // Check raw-data bucket
    console.log('📁 Raw files bucket:', CONFIG.S3_BUCKET_NAME);
    s3Client.listObjectsV2({ Bucket: CONFIG.S3_BUCKET_NAME, MaxKeys: 10 }, (err, data) => {
        if (err) {
            console.log('❌ Error accessing raw-data bucket:', err.code);
        } else {
            console.log(`  📄 Found ${data.Contents.length} files (images, etc.)`);
        }
    });

    // Check text-data bucket
    console.log('📝 Text bucket:', CONFIG.S3_TEXT_BUCKET_NAME);
    s3Client.listObjectsV2({ Bucket: CONFIG.S3_TEXT_BUCKET_NAME, MaxKeys: 10 }, (err, data) => {
        if (err) {
            console.log('❌ Error accessing text-data bucket:', err.code);
        } else {
            console.log(`  📄 Found ${data.Contents.length} files (metadata + OCR text)`);
        }
    });
};

// Simple test to check Lambda function
window.testLambdaCall = function () {
    console.log('🧪 Testing Lambda function call...');

    if (!lambdaClient) {
        console.log('❌ Lambda client not initialized');
        console.log('🔧 Check AWS credentials and configuration');
        return;
    }

    console.log('✅ Lambda client is ready');

    // Test 1: Check if function exists
    console.log('🔍 Checking if Lambda function exists...');
    lambdaClient.getFunction({ FunctionName: CONFIG.LAMBDA_DOC_TEXTRACT }, (err, data) => {
        if (err) {
            console.log('❌ Lambda function does not exist or no access:', err.code);
            console.log('💡 Solution: Create Lambda function in AWS console or check permissions');

            if (err.code === 'ResourceNotFoundException') {
                console.log('🔧 ACTION NEEDED: Create Lambda function "' + CONFIG.LAMBDA_DOC_TEXTRACT + '" in AWS console');
            } else if (err.code === 'AccessDeniedException') {
                console.log('🔑 ACTION NEEDED: Add Lambda invoke permissions to IAM user/role');
            }
        } else {
            console.log('✅ Lambda function exists:', data.Configuration.FunctionName);
            console.log('📊 Function info:', {
                Runtime: data.Configuration.Runtime,
                Handler: data.Configuration.Handler,
                Memory: data.Configuration.MemorySize,
                Timeout: data.Configuration.Timeout
            });

            // Test 2: Try to invoke the function
            console.log('🚀 Attempting to invoke Lambda function...');
            const invokeParams = {
                FunctionName: CONFIG.LAMBDA_DOC_TEXTRACT,
                Payload: JSON.stringify({
                    bucket: CONFIG.S3_BUCKET_NAME,
                    key: 'test-key.jpg',
                    textBucket: CONFIG.S3_TEXT_BUCKET_NAME,
                    metadata: {
                        eventId: 'test_123',
                        title: 'Test Event'
                    }
                })
            };

            lambdaClient.invoke(invokeParams, (invokeErr, invokeResult) => {
                if (invokeErr) {
                    console.log('❌ Lambda invocation failed:', invokeErr.code);
                    console.log('📋 Error details:', invokeErr.message);

                    if (invokeErr.code === 'AccessDeniedException') {
                        console.log('🔑 Permission issue - Lambda needs IAM role with S3 and Textract access');
                        console.log('💡 ACTION NEEDED: Update Lambda execution role with S3 and Textract permissions');
                    } else if (invokeErr.code === 'ResourceNotFoundException') {
                        console.log('🔍 Function exists but not accessible - check region or permissions');
                    }
                } else {
                    console.log('✅ Lambda invoked successfully!');
                    console.log('📋 Response:', invokeResult);

                    try {
                        const response = JSON.parse(invokeResult.Payload);
                        console.log('📊 Parsed response:', response);

                        if (response.statusCode === 200) {
                            console.log('🎉 Lambda executed successfully!');
                        } else {
                            console.log('⚠️ Lambda returned error status:', response);
                        }
                    } catch (parseErr) {
                        console.log('⚠️ Could not parse Lambda response:', parseErr);
                    }
                }
            });
        }
    });
};

// Initialize Application
document.addEventListener('DOMContentLoaded', function () {
    initializeAWS();
    initializeApp();
});

function initializeApp() {
    // Initial cleanup of test volunteer if exists
    const testVolunteerEmail = 'sruthikaks@student.tce.edu';
    let storedVolunteers = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS) || '[]');
    if (storedVolunteers.length > 0) {
        const filteredVolunteers = storedVolunteers.filter(v => v.email !== testVolunteerEmail);
        if (filteredVolunteers.length !== storedVolunteers.length) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(filteredVolunteers));
            console.log('🧹 Cleaned up test volunteer:', testVolunteerEmail);
        }
    }

    // Check if user is already logged in
    checkExistingSession();

    // Setup event listeners
    setupEventListeners();

    // Initialize Google Sign-In
    initializeGoogleSignIn();

    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden');
    }, 1000);
}

function checkExistingSession() {
    const storedUser = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        if (currentUser && currentUser.email) {
            showMainApp();
        } else {
            showLoginScreen();
        }
    } else {
        showLoginScreen();
    }
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            navigateToSection(section);
        });
    });

    // Mobile menu toggle
    document.querySelector('.mobile-menu-toggle').addEventListener('click', () => {
        document.querySelector('.nav-menu').classList.toggle('mobile-show');
    });

    // User dropdown
    document.getElementById('userDropdown').addEventListener('click', () => {
        document.getElementById('dropdownMenu').classList.toggle('show');
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            document.getElementById('dropdownMenu').classList.remove('show');
        }
    });

    // Form submissions
    setupUploadForm();
    setupVolunteerForm();
    setupChatForm();

    // Filters and search
    setupFilters();

    // View toggle removed as per request

    // Modal
    setupModal();

    // File upload
    setupFileUpload();
}

function initializeGoogleSignIn() {
    console.log('Initializing Google Sign-In with client ID:', CONFIG.GOOGLE_CLIENT_ID);

    // Wait for Google script to load
    const checkGoogleLoaded = setInterval(() => {
        if (typeof google !== 'undefined' && google.accounts) {
            clearInterval(checkGoogleLoaded);
            console.log('Google Accounts script loaded successfully');

            // Initialize Google Sign-In
            google.accounts.id.initialize({
                client_id: CONFIG.GOOGLE_CLIENT_ID,
                callback: handleGoogleSignIn,
                auto_select: false,
                cancel_on_tap_outside: false
            });

            console.log('Google Sign-In initialized');

            // Render the Google Sign-In button
            google.accounts.id.renderButton(
                document.getElementById('googleSignInBtn'),
                {
                    theme: 'outline',
                    size: 'large',
                    text: 'signin_with',
                    shape: 'rectangular',
                    logo_alignment: 'left',
                    width: '100%'
                }
            );

            console.log('Google Sign-In button rendered');

            // Also display the One Tap dialog for better UX
            google.accounts.id.prompt().then(() => {
                console.log('One Tap prompt displayed');
            }).catch((error) => {
                console.log('One Tap prompt failed:', error);
            });
        } else {
            console.log('Waiting for Google script to load...');
        }
    }, 100);

    // Clear interval after 10 seconds to prevent infinite checking
    setTimeout(() => {
        clearInterval(checkGoogleLoaded);
        if (typeof google === 'undefined') {
            console.error('Google script failed to load. Check your internet connection or the script URL.');
            showToast('Google Sign-In failed to load. Please refresh the page.', 'error');
        }
    }, 10000);
}

function handleGoogleSignIn(response) {
    try {
        // Handle Google Sign-In response
        if (!response.credential) {
            console.error('No credential received from Google');
            showToast('Sign-in failed. No credential received.', 'error');
            return;
        }

        // Decode the JWT token from Google
        const payload = JSON.parse(atob(response.credential.split('.')[1]));

        const userData = {
            email: payload.email,
            name: payload.name,
            picture: payload.picture,
            email_verified: payload.email_verified,
            sub: payload.sub, // Google unique ID
            given_name: payload.given_name,
            family_name: payload.family_name
        };

        console.log('Google Sign-In successful:', userData);

        // Validate email domain
        if (!validateCollegeEmail(userData.email)) {
            showToast('Please use your college email address (@tce.edu or @student.tce.edu)', 'error');
            return;
        }

        // Validate that email is verified
        if (!userData.email_verified) {
            showToast('Please verify your email address before signing in.', 'error');
            return;
        }

        // Determine user role
        userData.role = determineUserRole(userData.email);
        console.log('👤 User role determined:', userData.role, 'for email:', userData.email);
        userData.loginTime = new Date().toISOString();

        // Store user data
        currentUser = userData;
        localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(userData));

        // Show main application
        showMainApp();

        showToast(`Welcome to ${CONFIG.APP_NAME}, ${userData.name}!`, 'success');

    } catch (error) {
        console.error('❌ Sign-in process error:', error);
        // If we already showed the app, don't show the error toast as it's misleading
        const loginSection = document.getElementById('loginSection');
        if (loginSection && !loginSection.classList.contains('hidden')) {
            showToast('Sign-in failed. Please try again.', 'error');
        }
    }
}

function validateCollegeEmail(email) {
    console.log('🔍 Validating college email:', email);

    // Special case: allow sruthiks2007@gmail.com for testing
    if (email === 'sruthiks2007@gmail.com') {
        console.log('✅ Test email sruthiks2007@gmail.com allowed');
        return true;
    }

    const domains = [CONFIG.COLLEGE_DOMAIN, CONFIG.STUDENT_DOMAIN];
    const isValid = domains.some(domain => email.endsWith(domain));
    console.log('🔍 Email validation result:', isValid, 'for domains:', domains);
    return isValid;
}

function determineUserRole(email) {
    // Special case: make sruthiks2007@gmail.com an admin for testing
    if (email === 'sruthiks2007@gmail.com') {
        return 'admin';
    }

    // Check student domain first (more specific)
    if (email.endsWith(CONFIG.STUDENT_DOMAIN)) {
        return 'student';
    } else if (email.endsWith(CONFIG.ADMIN_DOMAIN)) {
        return 'admin';
    }
    return 'unknown';
}

function showMainApp() {
    if (!currentUser) return;

    // Hide login, show main app
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');

    // Update UI with user info
    updateUserInfo();

    // Show/hide role-based elements
    updateRoleBasedUI();

    // Load initial data
    loadDashboardData();

    // Reset all filters to default
    resetFilters();

    // Navigate to dashboard
    navigateToSection('dashboard');
}

function resetFilters() {
    console.log('🔄 Resetting all notice filters...');
    const filters = {
        'categoryFilter': 'all',
        'dateFilter': '',
        'searchNotices': ''
    };

    Object.entries(filters).forEach(([id, defaultValue]) => {
        const el = document.getElementById(id);
        if (el) el.value = defaultValue;
    });

    // If we're on the notices page, refresh the view
    const noticesContainer = document.getElementById('noticesContainer');
    if (noticesContainer && !noticesContainer.parentElement.classList.contains('hidden')) {
        renderNotices();
    }
}

function showLoginScreen() {
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('loginSection').classList.remove('hidden');
    
    // Clear filters on logout to prevent cross-account leakage
    resetFilters();
}

function updateUserInfo() {
    if (!currentUser) return;

    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('dashboardUserName').textContent = currentUser.name.split(' ')[0];
    document.getElementById('userRole').textContent = currentUser.role === 'admin' ? 'Staff' : 'Student';

    // Fix user avatar - handle Google profile picture URL or use fallback
    const userAvatar = document.getElementById('userAvatar');
    if (currentUser.picture && currentUser.picture.startsWith('https://')) {
        userAvatar.src = currentUser.picture;
    } else {
        // Use a default avatar based on user's name
        const seed = currentUser.name.replace(/\s+/g, '').toLowerCase();
        userAvatar.src = `https://picsum.photos/seed/${seed}/100/100.jpg`;
    }

    // Handle avatar load error
    userAvatar.onerror = function () {
        this.src = 'https://picsum.photos/seed/default-avatar/100/100.jpg';
    };

    // Update greeting based on time
    const hour = new Date().getHours();
    let greeting = 'Good ';
    if (hour < 12) greeting += 'morning';
    else if (hour < 17) greeting += 'afternoon';
    else greeting += 'evening';

    document.getElementById('dashboardGreeting').textContent = `${greeting}! Stay updated with the latest college events and notices`;
}

function updateRoleBasedUI() {
    const isAdmin = currentUser.role === 'admin';
    const isVolunteer = volunteers.some(v => v.email === currentUser.email && v.status === 'approved');

    // Show/hide admin-only elements (ONLY for actual admins)
    document.querySelectorAll('.admin-only').forEach(el => {
        el.classList.toggle('hidden', !isAdmin);
    });

    // Show/hide student volunteer view (hide for admins)
    const studentVolView = document.querySelector('.student-volunteer-view');
    if (studentVolView) {
        studentVolView.classList.toggle('hidden', isAdmin);
    }

    // Show volunteer-only elements for students
    document.querySelectorAll('.volunteer-only').forEach(el => {
        el.classList.toggle('hidden', currentUser.role !== 'student');
    });

    // Show volunteer-upload-only elements for approved volunteers
    document.querySelectorAll('.volunteer-upload-only').forEach(el => {
        el.classList.toggle('hidden', !isVolunteer && !isAdmin);
    });

    // Load volunteer data for students
    if (currentUser.role === 'student') {
        loadVolunteerData();
    }
}

function updateVolunteerStatus() {
    console.log('🔄 Updating volunteer status for:', currentUser.email);

    // Always reload volunteers from localStorage to get latest data
    const storedVolunteers = localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS);
    if (storedVolunteers) {
        volunteers = JSON.parse(storedVolunteers);
        console.log('📥 Reloaded volunteers in updateVolunteerStatus:', volunteers.length);
    }

    const volunteer = volunteers.find(v => v.email === currentUser.email);
    const statusElement = document.getElementById('volunteerStatus');
    const requestForm = document.getElementById('volunteerRequestForm');
    const uploadSection = document.getElementById('volunteerUploadSection');
    const uploadsSection = document.getElementById('myUploadsSection');
    const rejectionReason = document.getElementById('rejectionReason');

    console.log('👤 Found volunteer data:', volunteer ? volunteer.status : 'None');

    if (volunteer) {
        if (statusElement) {
            statusElement.textContent = volunteer.status.charAt(0).toUpperCase() + volunteer.status.slice(1);
            statusElement.className = `status-badge ${volunteer.status}`;
        }

        if (volunteer.status === 'pending') {
            if (requestForm) requestForm.classList.add('hidden');
            if (uploadSection) uploadSection.classList.add('hidden');
            if (uploadsSection) uploadsSection.classList.add('hidden');

            // Show pending status message
            const pendingMessage = document.getElementById('volunteerPendingMessage') ||
                document.createElement('div');
            pendingMessage.id = 'volunteerPendingMessage';
            pendingMessage.className = 'alert alert-warning';
            pendingMessage.innerHTML = `
                <i class="fas fa-clock"></i>
                Your volunteer application is pending approval.
                You'll be able to upload events once it's approved by an administrator.
            `;
            uploadSection.parentNode.insertBefore(pendingMessage, uploadSection);
        } else if (volunteer.status === 'approved') {
            if (requestForm) requestForm.classList.add('hidden');
            if (uploadSection) uploadSection.classList.remove('hidden');
            if (uploadsSection) uploadsSection.classList.remove('hidden');
            loadMyUploads();

            // Remove pending message if it exists
            const pendingMessage = document.getElementById('volunteerPendingMessage');
            if (pendingMessage) {
                pendingMessage.remove();
            }
        } else if (volunteer.status === 'rejected') {
            if (requestForm) requestForm.classList.remove('hidden');
            if (uploadSection) uploadSection.classList.add('hidden');
            if (uploadsSection) uploadsSection.classList.add('hidden');

            // Show rejection reason if available
            if (volunteer.rejectionReason) {
                rejectionReason.textContent = 'Previous rejection reason: ' + volunteer.rejectionReason;
                rejectionReason.classList.remove('hidden');
            }

            // Add resubmission notice to the form
            addResubmissionNotice();
        }
    } else {
        if (statusElement) {
            statusElement.textContent = 'Not Applied';
            statusElement.className = 'status-badge';
        }
        if (requestForm) requestForm.classList.remove('hidden');
        if (uploadSection) uploadSection.classList.add('hidden');
        if (uploadsSection) uploadsSection.classList.add('hidden');
    }
}

function addResubmissionNotice() {
    const formContainer = document.getElementById('volunteerRequestForm');
    if (!formContainer) return;

    // Remove existing notice if any
    const existingNotice = document.getElementById('resubmissionNotice');
    if (existingNotice) {
        existingNotice.remove();
    }

    // Add resubmission notice at the top of the form
    const notice = document.createElement('div');
    notice.id = 'resubmissionNotice';
    notice.className = 'alert alert-info';
    notice.style.marginBottom = '20px';
    notice.innerHTML = `
        <i class="fas fa-info-circle"></i>
        <strong>Resubmit Your Application</strong><br>
        Your previous application was rejected. You can update your information and submit a new application below.
    `;

    // Insert at the beginning of the form container
    formContainer.insertBefore(notice, formContainer.firstChild);
}

function updateExistingRequest(volunteerId, formData) {
    console.log('🔄 Updating existing volunteer request:', volunteerId);

    const existingVolunteer = volunteers.find(v => v.email === currentUser.email);
    if (existingVolunteer) {
        // Update the existing request
        existingVolunteer.name = formData.get('volunteerName') || currentUser.name;
        existingVolunteer.rollNumber = formData.get('volunteerRoll');
        existingVolunteer.phone = formData.get('volunteerPhone');
        existingVolunteer.department = formData.get('volunteerDepartment');
        existingVolunteer.year = formData.get('volunteerYear');
        existingVolunteer.club = formData.get('volunteerClub');
        existingVolunteer.reason = formData.get('volunteerReason');
        existingVolunteer.status = 'pending'; // Reset to pending
        existingVolunteer.appliedAt = new Date().toISOString(); // Update application date
        existingVolunteer.rejectionReason = null; // Clear previous rejection reason
        existingVolunteer.resubmitted = true; // Mark as resubmitted

        console.log('✅ Updated existing volunteer request:', existingVolunteer);
        return existingVolunteer;
    }
    return null;
}

function loadMyUploads() {
    const uploads = JSON.parse(localStorage.getItem('volunteer_uploads') || '[]')
        .filter(upload => upload.uploadedBy === currentUser.email);

    const tbody = document.getElementById('uploadsTableBody');

    if (uploads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">No uploads yet</td></tr>';
        return;
    }

    tbody.innerHTML = uploads.map(upload => `
        <tr>
            <td>${upload.fileName}</td>
            <td>${formatDate(upload.uploadDate)}</td>
            <td><span class="status-badge ${upload.status}">${upload.status}</span></td>
            <td>
                <button class="btn-small btn-danger" onclick="deleteUpload('${upload.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Admin Volunteer Management Functions
function loadAdminVolunteerManagement() {
    if (!currentUser || currentUser.role !== 'admin') return;

    console.log('🔧 Loading admin volunteer management...');

    // Update statistics
    updateVolunteerStatistics();

    // Load pending requests
    loadPendingRequests();
}

function updateVolunteerStatistics() {
    // Always reload volunteers from localStorage to get latest data
    const storedVolunteers = localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS);
    if (storedVolunteers) {
        volunteers = JSON.parse(storedVolunteers);
    }

    const pendingCount = volunteers.filter(v => v.status === 'pending').length;
    const acceptedCount = volunteers.filter(v => v.status === 'approved').length;
    const rejectedCount = volunteers.filter(v => v.status === 'rejected').length;

    document.getElementById('pendingRequestsCount').textContent = pendingCount;
    document.getElementById('acceptedRequestsCount').textContent = acceptedCount;
    document.getElementById('rejectedRequestsCount').textContent = rejectedCount;

    console.log('📊 Volunteer stats updated:', { pendingCount, acceptedCount, rejectedCount });
}

function loadPendingRequests() {
    // Always reload volunteers from localStorage to get latest data
    const storedVolunteers = localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS);
    if (storedVolunteers) {
        volunteers = JSON.parse(storedVolunteers);
    }

    const pendingRequests = volunteers.filter(v => v.status === 'pending');
    const requestsList = document.getElementById('pendingRequestsList');

    if (pendingRequests.length === 0) {
        requestsList.innerHTML = `
            <div class="no-requests">
                <i class="fas fa-clipboard-check"></i>
                <p>No pending volunteer requests</p>
            </div>
        `;
        return;
    }

    requestsList.innerHTML = pendingRequests.map(request => `
        <div class="volunteer-request-item" data-request-id="${request.id}">
            <div class="request-header">
                <div class="request-info">
                    <h4>${request.name}</h4>
                    <div class="email">${request.email}</div>
                </div>
                <div class="request-date">
                    Applied: ${formatDate(request.appliedAt)}
                </div>
            </div>

            <div class="request-details">
                <div class="detail-field">
                    <label>Roll Number</label>
                    <span>${request.rollNumber || 'Not provided'}</span>
                </div>
                <div class="detail-field">
                    <label>Department</label>
                    <span>${request.department || 'Not specified'}</span>
                </div>
                <div class="detail-field">
                    <label>Year</label>
                    <span>${request.year || 'Not specified'}</span>
                </div>
                <div class="detail-field">
                    <label>Club/Team</label>
                    <span>${request.club || 'Not specified'}</span>
                </div>
            </div>

            ${request.reason ? `
                <div class="request-reason">
                    <strong>Reason for requesting access:</strong><br>
                    ${request.reason}
                </div>
            ` : ''}

            <div class="request-actions">
                <button class="btn-accept" onclick="acceptVolunteerRequest('${request.id}')">
                    <i class="fas fa-check"></i> Accept
                </button>
                <button class="btn-reject" onclick="rejectVolunteerRequest('${request.id}')">
                    <i class="fas fa-times"></i> Reject
                </button>
            </div>
        </div>
    `).join('');

    console.log('📋 Loaded pending requests:', pendingRequests.length);
}

function acceptVolunteerRequest(requestId) {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast('Only administrators can accept volunteer requests.', 'error');
        return;
    }

    console.log('🔄 Accepting volunteer request:', requestId);

    // Reload volunteers from localStorage first to get latest data
    const storedVolunteers = localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS);
    if (storedVolunteers) {
        volunteers = JSON.parse(storedVolunteers);
    }

    const request = volunteers.find(v => v.id === requestId);
    if (!request) {
        showToast('Volunteer request not found.', 'error');
        return;
    }

    console.log('👤 Found request to accept:', request.name);

    // Update request status
    request.status = 'approved';
    request.approvedAt = new Date().toISOString();
    request.approvedBy = currentUser.email;

    // Save to localStorage
    localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(volunteers));

    console.log('💾 Saved updated volunteers to localStorage');

    // Create notification for the student
    createVolunteerNotification(request.email, 'accepted', request.name);

    // Remove the request item from DOM with animation
    const requestItem = document.querySelector(`[data-request-id="${requestId}"]`);
    if (requestItem) {
        console.log('🗑️ Removing request item from DOM with animation');
        requestItem.classList.add('removing');
        setTimeout(() => {
            requestItem.remove();
        }, 500);
    }

    // Update UI - reload data to ensure consistency
    updateVolunteerStatistics();
    loadPendingRequests();

    // Show success message
    showToast(`Volunteer request from ${request.name} has been accepted!`, 'success');

    console.log('✅ Accepted volunteer request:', request);
}

function rejectVolunteerRequest(requestId) {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast('Only administrators can reject volunteer requests.', 'error');
        return;
    }

    console.log('🔄 Rejecting volunteer request:', requestId);

    // Reload volunteers from localStorage first to get latest data
    const storedVolunteers = localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS);
    if (storedVolunteers) {
        volunteers = JSON.parse(storedVolunteers);
    }

    const request = volunteers.find(v => v.id === requestId);
    if (!request) {
        showToast('Volunteer request not found.', 'error');
        return;
    }

    console.log('👤 Found request to reject:', request.name);

    // Ask for rejection reason
    const reason = prompt('Please provide a reason for rejection (optional):');

    // Update request status
    request.status = 'rejected';
    request.rejectedAt = new Date().toISOString();
    request.rejectedBy = currentUser.email;
    request.rejectionReason = reason || 'No reason provided';

    // Save to localStorage
    localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(volunteers));

    console.log('💾 Saved updated volunteers to localStorage');

    // Create notification for the student
    createVolunteerNotification(request.email, 'rejected', request.name, reason);

    // Remove the request item from DOM with animation
    const requestItem = document.querySelector(`[data-request-id="${requestId}"]`);
    if (requestItem) {
        console.log('🗑️ Removing request item from DOM with animation');
        requestItem.classList.add('removing');
        setTimeout(() => {
            requestItem.remove();
        }, 500);
    }

    // Update UI - reload data to ensure consistency
    updateVolunteerStatistics();
    loadPendingRequests();

    // Show success message
    showToast(`Volunteer request from ${request.name} has been rejected.`, 'info');

    console.log('❌ Rejected volunteer request:', request);
}

function loadApprovedVolunteers() {
    console.log('🔧 Loading approved volunteers...');
    
    // Reload volunteers from localStorage first to get latest data
    const storedVolunteers = localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS);
    if (storedVolunteers) {
        volunteers = JSON.parse(storedVolunteers);
    }

    const approvedVolunteers = volunteers.filter(v => v.status === 'approved');
    const tableBody = document.getElementById('approvedVolunteersTableBody');
    
    if (!tableBody) return;

    if (approvedVolunteers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center">No approved volunteers found.</td></tr>';
        return;
    }

    renderApprovedVolunteers(approvedVolunteers);
    setupApprovedVolunteersFilters();
}

function renderApprovedVolunteers(volunteersList) {
    const tableBody = document.getElementById('approvedVolunteersTableBody');
    tableBody.innerHTML = volunteersList.map(v => `
        <tr>
            <td>
                <div class="user-info-cell">
                    <span class="user-name">${v.name}</span>
                    <span class="user-email">${v.email}</span>
                </div>
            </td>
            <td>${v.rollNumber || '-'}</td>
            <td>${v.department || '-'}</td>
            <td>${v.approvedAt ? formatDate(v.approvedAt) : 'N/A'}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon btn-view" title="View Details" onclick="showVolunteerDetails('${v.id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon btn-remove" title="Remove Volunteer" onclick="removeVolunteer('${v.id}')">
                        <i class="fas fa-user-minus"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function setupApprovedVolunteersFilters() {
    const searchInput = document.getElementById('searchApprovedVolunteers');
    const deptFilter = document.getElementById('deptFilterApproved');

    const runFilters = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const selectedDept = deptFilter.value.toLowerCase();

        const filtered = volunteers.filter(v => {
            if (v.status !== 'approved') return false;
            
            const matchesSearch = v.name.toLowerCase().includes(searchTerm) || 
                                v.email.toLowerCase().includes(searchTerm);
            const matchesDept = selectedDept === 'all' || v.department.toLowerCase().includes(selectedDept);
            
            return matchesSearch && matchesDept;
        });

        renderApprovedVolunteers(filtered);
    };

    searchInput.addEventListener('input', runFilters);
    deptFilter.addEventListener('change', runFilters);
}

function showVolunteerDetails(volunteerId) {
    const volunteer = volunteers.find(v => v.id === volunteerId);
    if (!volunteer) return;

    const detailsBody = document.getElementById('volunteerDetailsBody');
    detailsBody.innerHTML = `
        <div class="volunteer-detail-grid">
            <div class="detail-group">
                <label>Full Name</label>
                <p>${volunteer.name}</p>
            </div>
            <div class="detail-group">
                <label>Email Address</label>
                <p>${volunteer.email}</p>
            </div>
            <div class="detail-group">
                <label>Phone Number</label>
                <p>${volunteer.phone || 'Not provided'}</p>
            </div>
            <div class="detail-group">
                <label>Roll Number</label>
                <p>${volunteer.rollNumber}</p>
            </div>
            <div class="detail-group">
                <label>Department</label>
                <p>${volunteer.department}</p>
            </div>
            <div class="detail-group">
                <label>Year of Study</label>
                <p>${volunteer.year}${volunteer.year.length === 1 ? ' year' : ''}</p>
            </div>
            <div class="detail-group">
                <label>Club/Team</label>
                <p>${volunteer.club}</p>
            </div>
            <div class="detail-group">
                <label>Status</label>
                <p><span class="status-badge approved">Approved</span></p>
            </div>
            <div class="detail-group">
                <label>Approved On</label>
                <p>${volunteer.approvedAt ? formatDateTime(volunteer.approvedAt) : 'N/A'}</p>
            </div>
            <div class="detail-group full-width">
                <label>Reason for Requesting</label>
                <p>${volunteer.reason}</p>
            </div>
        </div>
    `;

    document.getElementById('volunteerDetailsModal').classList.add('show');
}

function removeVolunteer(volunteerId) {
    if (!confirm('Are you sure you want to remove this volunteer? They will lose access to upload events.')) return;

    const volunteer = volunteers.find(v => v.id === volunteerId);
    if (!volunteer) return;

    volunteer.status = 'rejected';
    volunteer.rejectionReason = 'Access revoked by administrator';
    volunteer.revokedAt = new Date().toISOString();
    volunteer.revokedBy = currentUser.email;

    localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(volunteers));
    
    showToast(`${volunteer.name} has been removed from approved volunteers.`, 'info');
    
    // Refresh the list
    loadApprovedVolunteers();
    updateVolunteerStatistics();
}


function createVolunteerNotification(studentEmail, action, studentName, reason = null) {
    const notifications = JSON.parse(localStorage.getItem('volunteer_notifications') || '[]');

    const notification = {
        id: Date.now().toString(),
        email: studentEmail,
        type: action,
        studentName: studentName,
        reason: reason,
        createdAt: new Date().toISOString(),
        read: false
    };

    notifications.push(notification);
    localStorage.setItem('volunteer_notifications', JSON.stringify(notifications));

    console.log(`📬 Created ${action} notification for ${studentEmail}:`, notification);
}

async function deleteUpload(uploadId) {
    console.log('🗑️ Starting delete for uploadId:', uploadId);
    if (!confirm('Are you sure you want to delete this upload?')) return;

    try {
        const uploads = JSON.parse(localStorage.getItem('volunteer_uploads') || '[]');
        const upload = uploads.find(u => u.id === uploadId);

        console.log('🗑️ Found upload to delete:', upload);

        if (upload.s3Key) {
            console.log('🗑️ Attempting to delete from S3:', upload.s3Key);
            console.log('🗑️ Bucket:', CONFIG.S3_BUCKET_NAME);

            // Delete from S3 with error handling
            try {
                await new Promise((resolve, reject) => {
                    s3Client.deleteObject({
                        Bucket: CONFIG.S3_BUCKET_NAME,
                        Key: upload.s3Key
                    }, (err, data) => {
                        if (err) {
                            console.error('🔴 S3 delete error:', err);
                            reject(err);
                        } else {
                            console.log('🗑️ S3 delete successful:', data);
                            resolve(data);
                        }
                    });
                });
                console.log('🗑️ S3 file deleted successfully');
            } catch (s3Error) {
                console.error('🔴 Failed to delete from S3:', s3Error);
                showToast('Warning: Could not delete file from cloud, but removed from local listings', 'warning');
            }

            // Also try to delete associated metadata and text files
            try {
                const baseFileName = upload.s3Key.replace(/\.[^/.]+$/, ''); // Remove extension
                const metadataKey = `${baseFileName}.json`;
                const textKey = `${baseFileName}.txt`;

                // Delete metadata file from text-data bucket
                await new Promise((resolve) => {
                    s3Client.deleteObject({
                        Bucket: CONFIG.S3_TEXT_BUCKET_NAME,
                        Key: metadataKey
                    }, () => resolve());
                });

                // Delete text file from text bucket
                await new Promise((resolve) => {
                    s3Client.deleteObject({
                        Bucket: CONFIG.S3_TEXT_BUCKET_NAME,
                        Key: textKey
                    }, () => resolve());
                });

                console.log('🗑️ Associated metadata and text files deleted');
            } catch (metaError) {
                console.log('🗑️ Could not delete associated files (may not exist):', metaError);
            }
        } else {
            console.log('🗑️ No S3 key found, skipping S3 deletion');
        }

        // Also try to find and delete by imageUrl if available
        if (upload.fileUrl && upload.fileUrl.includes(CONFIG.S3_BUCKET_NAME)) {
            try {
                const urlKey = upload.fileUrl.split('/').pop();
                console.log('🗑️ Also attempting to delete by URL key:', urlKey);

                await new Promise((resolve) => {
                    s3Client.deleteObject({
                        Bucket: CONFIG.S3_BUCKET_NAME,
                        Key: urlKey
                    }, () => resolve());
                });
            } catch (urlError) {
                console.log('🗑️ Could not delete by URL key (may already be deleted):', urlError);
            }
        }

        // Fallback: Try to find and delete the file by searching S3
        if (!upload.s3Key || !upload.s3Key.startsWith('event_')) {
            console.log('🔍 No valid S3 key found, searching for file by pattern...');
            try {
                // List objects to find matching file
                const listParams = {
                    Bucket: CONFIG.S3_BUCKET_NAME,
                    Prefix: 'event_',
                    MaxKeys: 1000
                };

                const listData = await new Promise((resolve, reject) => {
                    s3Client.listObjectsV2(listParams, (err, data) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                // Find files uploaded by this user around the upload date
                const uploadDate = new Date(upload.uploadDate);
                const uploadTimestamp = uploadDate.getTime();

                const matchingFiles = listData.Contents.filter(obj => {
                    if (obj.Key.endsWith('/')) return false; // Skip folders

                    // Try to extract timestamp from filename
                    const timestampMatch = obj.Key.match(/event_(\d+)_/);
                    if (!timestampMatch) return false;

                    const fileTimestamp = parseInt(timestampMatch[1]);
                    const timeDiff = Math.abs(fileTimestamp - uploadTimestamp);

                    // Consider files uploaded within 5 minutes as potential matches
                    return timeDiff < 300000; // 5 minutes in milliseconds
                });

                console.log('🔍 Found potential matching files:', matchingFiles);

                // Delete matching files
                for (const file of matchingFiles) {
                    await new Promise((resolve) => {
                        s3Client.deleteObject({
                            Bucket: CONFIG.S3_BUCKET_NAME,
                            Key: file.Key
                        }, () => resolve());
                    });
                    console.log('🗑️ Deleted matching file:', file.Key);
                }
            } catch (searchError) {
                console.log('🔍 Could not search S3 for matching files:', searchError);
            }
        }

        // Also remove from main notices list
        const noticeToDelete = notices.find(n => n.uploadedBy === upload.uploadedBy && n.title === upload.title);
        if (noticeToDelete) {
            console.log('🔍 Deleting notice from main feed:', noticeToDelete.id);
            notices = notices.filter(n => n.id !== noticeToDelete.id);
            localStorage.setItem(CONFIG.STORAGE_KEYS.NOTICES, JSON.stringify(notices));

            // Refresh displays
            updateDashboardStats();
            updateLatestNotices();
            updateUpcomingEvents();
            const noticesContainer = document.getElementById('noticesContainer');
            if (noticesContainer) {
                renderNotices();
            }
        }

        // Remove from volunteer uploads local storage
        const updatedUploads = uploads.filter(u => u.id !== uploadId);
        localStorage.setItem('volunteer_uploads', JSON.stringify(updatedUploads));

        loadMyUploads();
        showToast('Upload deleted successfully', 'success');

    } catch (error) {
        console.error('Error deleting upload:', error);
        showToast('Failed to delete upload', 'error');
    }
}



function navigateToSection(sectionId) {
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.section === sectionId);
    });

    // Update sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.toggle('active', section.id === sectionId);
    });

    // Load section-specific data
    loadSectionData(sectionId);

    // Reset filters when changing sections to ensure a clean state
    resetFilters();

    // Close mobile menu
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) {
        navMenu.classList.remove('mobile-show');
    }
}

function loadSectionData(sectionId) {
    switch (sectionId) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'notices':
            loadNotices();
            break;
        case 'upload':
            // Upload section doesn't need initial data loading
            break;
        case 'chatbot':
            initializeChatbot();
            break;
        case 'profile':
            loadProfileData();
            break;
        case 'settings':
            loadSettingsData();
            break;
        case 'volunteer':
            loadVolunteerData();
            break;
        case 'approvedVolunteers':
            showVolunteerRequests.currentView = 'approved';
            navigateToSection('volunteer');
            break;
        case 'admin':
            if (currentUser && currentUser.role === 'admin') {
                loadAdminData();
            }
            break;
    }
}

function showVolunteerSubSection(subSectionId) {
    const subSections = [
        'volunteerRequestForm', 
        'volunteerUploadSection', 
        'adminVolunteerManagement', 
        'approvedVolunteersSection',
        'myUploadsSection'
    ];
    
    subSections.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === subSectionId) {
                el.classList.remove('hidden');
            } else {
                // Only hide if it's not a persistent state (like status card)
                // but for these main cards, we usually only show one or two based on role
                // In admin mode, we toggle between management and approved list
                if (currentUser.role === 'admin' && (id === 'adminVolunteerManagement' || id === 'approvedVolunteersSection')) {
                    el.classList.add('hidden');
                }
                // Students see request form or upload section based on status
            }
        }
    });

    // Special case for Approved Volunteers section
    if (subSectionId === 'approvedVolunteersSection') {
        document.getElementById('adminVolunteerManagement').classList.add('hidden');
        document.getElementById('approvedVolunteersSection').classList.remove('hidden');
    } else if (subSectionId === 'adminVolunteerManagement') {
        document.getElementById('approvedVolunteersSection').classList.add('hidden');
        document.getElementById('adminVolunteerManagement').classList.remove('hidden');
    }
}

function loadDashboardData() {
    // Load mock data for now (replace with actual AWS API calls)
    loadNotices().then(() => {
        updateDashboardStats();
        updateLatestNotices();
        updateUpcomingEvents();
    });
}

function updateDashboardStats() {
    const totalNotices = notices.length;
    const todayNotices = notices.filter(n => {
        const noticeDate = new Date(n.date).toDateString();
        const today = new Date().toDateString();
        return noticeDate === today;
    }).length;
    const recentNotices = notices.filter(n => {
        const noticeDate = new Date(n.date);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        return noticeDate >= threeDaysAgo;
    }).length;

    document.getElementById('totalNotices').textContent = totalNotices;
    document.getElementById('todayNotices').textContent = todayNotices;
    document.getElementById('recentNotices').textContent = recentNotices;
    document.getElementById('volunteerCount').textContent = volunteers.filter(v => v.status === 'approved').length;
}

function updateLatestNotices() {
    const container = document.getElementById('latestNotices');
    const latestNotices = notices.slice(0, 5);

    if (latestNotices.length === 0) {
        container.innerHTML = '<p class="text-center">No notices available</p>';
        return;
    }

    container.innerHTML = latestNotices.map(notice => `
        <div class="notice-item" onclick="viewNotice('${notice.id}')">
            <div class="notice-title">${notice.title}</div>
            <div class="notice-meta">
                <span class="notice-badge">${notice.category}</span>
                <span class="notice-date">${formatDate(notice.eventDate || notice.date)}</span>
            </div>
        </div>
    `).join('');
}

function updateUpcomingEvents() {
    const container = document.getElementById('upcomingEvents');

    console.log('🗓️ Updating upcoming events...');
    console.log('🗓️ All notices:', notices.map(n => ({ id: n.id, title: n.title, eventDate: n.eventDate, uploadDate: n.date })));

    const upcomingNotices = notices
        .filter(n => {
            const hasEventDate = n.eventDate;
            const isInFuture = hasEventDate && new Date(n.eventDate) >= new Date();
            console.log(`🗓️ Notice "${n.title}": eventDate=${n.eventDate}, hasEventDate=${hasEventDate}, isInFuture=${isInFuture}`);
            return hasEventDate && isInFuture;
        })
        .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))
        .slice(0, 5);

    console.log('🗓️ Upcoming notices after filtering:', upcomingNotices.map(n => ({ id: n.id, title: n.title, eventDate: n.eventDate })));

    if (upcomingNotices.length === 0) {
        container.innerHTML = '<p class="text-center">No upcoming events</p>';
        return;
    }

    container.innerHTML = upcomingNotices.map(notice => `
        <div class="event-item" onclick="viewNotice('${notice.id}')">
            <div class="event-title">${notice.title}</div>
            <div class="event-date">
                <i class="fas fa-calendar"></i>
                ${formatDate(notice.eventDate || notice.date)}
            </div>
            ${notice.eventDate ? '' : '<div class="event-warning" style="font-size: 0.8em; color: #f39c12;"><i class="fas fa-exclamation-triangle"></i> Upload date shown</div>'}
        </div>
    `).join('');
}

// Upload file to S3
function uploadFileToS3(file, callback) {
    // Validate
    if (!file) {
        callback(new Error("No file selected"));
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        callback(new Error("File too large (Max 5MB)"));
        return;
    }

    const params = {
        Bucket: CONFIG.S3_BUCKET_NAME,
        Key: `events/${Date.now()}-${file.name}`,
        Body: file,
        ContentType: file.type
    };

    s3Client.upload(params, (err, data) => {
        if (err) {
            callback(new Error(err.message));
        } else {
            callback(null, data.Location);
        }
    });
}

// Trigger text extraction Lambda function
function triggerTextExtraction(fileName, eventData, callback) {
    console.log('🔍 Starting OCR text extraction for:', fileName);
    console.log('📁 Source bucket:', CONFIG.S3_BUCKET_NAME);
    console.log('📝 Target text bucket:', CONFIG.S3_TEXT_BUCKET_NAME);
    console.log('🤖 Lambda function:', CONFIG.LAMBDA_DOC_TEXTRACT);

    // Check if lambdaClient exists
    if (!lambdaClient) {
        console.error('❌ Lambda client not initialized!');
        console.log('🔄 AWS Lambda not available - skipping text extraction');
        callback(null, 'skipped');
        return;
    }

    console.log('✅ Lambda client is ready');

    const payload = {
        bucket: CONFIG.S3_BUCKET_NAME,
        key: fileName,
        textBucket: CONFIG.S3_TEXT_BUCKET_NAME,
        metadata: {
            eventId: eventData.eventId,
            title: eventData.title,
            description: eventData.description,
            category: eventData.category,
            eventDate: eventData.eventDate,
            priority: eventData.priority
        }
    };

    console.log('📤 Lambda payload being sent:', JSON.stringify(payload, null, 2));

    const params = {
        FunctionName: CONFIG.LAMBDA_DOC_TEXTRACT,
        Payload: JSON.stringify(payload)
    };

    console.log('🚀 Calling Lambda function:', CONFIG.LAMBDA_DOC_TEXTRACT);

    lambdaClient.invoke(params, (err, result) => {
        if (err) {
            console.error('❌ Lambda call failed:', err);
            console.log('📋 Lambda error code:', err.code);
            console.log('📋 Lambda error message:', err.message);

            // Store metadata fallback
            storeEventTextData(fileName, eventData, callback);
        } else {
            console.log('✅ Lambda called successfully');
            console.log('📋 Lambda response type:', typeof result);
            console.log('📋 Lambda response:', result);

            try {
                const response = JSON.parse(result.Payload);
                console.log('📋 Parsed response:', response);

                // Always store metadata fallback for now
                storeEventTextData(fileName, eventData, callback);
            } catch (parseError) {
                console.error('❌ Could not parse Lambda response:', parseError);
                storeEventTextData(fileName, eventData, callback);
            }
        }
    });
}

// Verify if text file exists in text-data bucket
function verifyTextFileExists(eventId, callback) {
    const textKey = `${eventId}.txt`;

    console.log('🔍 Checking if text file exists:', textKey);

    const params = {
        Bucket: CONFIG.S3_TEXT_BUCKET_NAME,
        Key: textKey
    };

    // Use headObject to check if file exists (faster than getObject)
    s3Client.headObject(params, (err, data) => {
        if (err) {
            if (err.code === 'NotFound') {
                console.log('❌ Text file not found:', textKey);
                callback(false);
            } else {
                console.error('❌ Error checking text file:', err);
                callback(false);
            }
        } else {
            console.log('✅ Text file found:', textKey);
            console.log('📊 File metadata:', {
                size: data.ContentLength,
                lastModified: data.LastModified,
                contentType: data.ContentType
            });
            callback(true);
        }
    });
}

function storeEventTextData(fileName, eventData, callback) {
    console.log('📝 Storing metadata-only text as fallback (OCR failed or unavailable)');

    // Create a comprehensive text document for search (METADATA ONLY)
    const textContent = `
EVENT ID: ${eventData.eventId}
TITLE: ${eventData.title}
DESCRIPTION: ${eventData.description}
CATEGORY: ${eventData.category}
EVENT DATE: ${eventData.eventDate}
PRIORITY: ${eventData.priority}
UPLOADED BY: ${eventData.uploadedBy}
UPLOAD DATE: ${eventData.date}
SOURCE FILE: ${fileName}

NOTE: This is metadata-only text. OCR text extraction was not available.

EVENT DETAILS:
${eventData.description}

Searchable keywords: ${eventData.title} ${eventData.category} ${eventData.description}
    `.trim();

    const textKey = `${eventData.eventId}.txt`;

    const textParams = {
        Bucket: CONFIG.S3_TEXT_BUCKET_NAME,
        Key: textKey,
        Body: textContent,
        ContentType: 'text/plain',
        Metadata: {
            'event-id': eventData.eventId,
            'source-image': fileName,
            'content-type': 'event-metadata-fallback',
            'category': eventData.category,
            'event-date': eventData.eventDate,
            'extraction-method': 'metadata-only'
        }
    };

    s3Client.upload(textParams, (err, data) => {
        if (err) {
            console.error('❌ Error storing event text data fallback:', err);
        } else {
            console.log('✅ Event metadata fallback text stored:', data.Location);
            console.log('⚠️  To get actual OCR text, ensure Lambda function is properly configured');
        }
        if (callback) callback();
    });
}

// Load notices from S3 bucket
async function loadNoticesFromS3() {
    try {
        // First load all metadata JSON files from text-data bucket
        console.log('📂 Loading metadata files from text-data bucket:', CONFIG.S3_TEXT_BUCKET_NAME);
        const metadataParams = {
            Bucket: CONFIG.S3_TEXT_BUCKET_NAME,
            MaxKeys: 100
        };

        const metadataData = await s3Client.listObjectsV2(metadataParams).promise();
        const metadataFiles = {};

        // Load all metadata files (JSON files)
        await Promise.all(metadataData.Contents.map(async (object) => {
            if (object.Key.endsWith('.json')) {
                try {
                    const metadataResult = await s3Client.getObject({
                        Bucket: CONFIG.S3_TEXT_BUCKET_NAME,
                        Key: object.Key
                    }).promise();

                    const eventData = JSON.parse(metadataResult.Body.toString());
                    metadataFiles[eventData.eventId] = eventData;
                    console.log('Loaded metadata for:', eventData.eventId, eventData.title);
                } catch (error) {
                    console.error('Error loading metadata file:', object.Key, error);
                }
            }
        }));

        console.log('All metadata files loaded:', Object.keys(metadataFiles).length, 'files');

        // Then load image files from raw-data bucket and match with metadata
        console.log('🖼️ Loading image files from raw-data bucket (NO metadata attached):', CONFIG.S3_BUCKET_NAME);
        const params = {
            Bucket: CONFIG.S3_BUCKET_NAME,
            MaxKeys: 100
        };

        const data = await s3Client.listObjectsV2(params).promise();
        const noticePromises = data.Contents.map(async (object) => {
            try {
                // Skip directories and metadata files
                if (object.Key.endsWith('/') || object.Key.endsWith('.json') || object.Key.endsWith('.txt')) return null;

                // Try to find matching metadata by extracting eventId from filename
                const eventIdMatch = object.Key.match(/event_(\d+)_/);
                let eventId = null;
                let noticeData = null;

                if (eventIdMatch) {
                    eventId = `event_${eventIdMatch[1]}`;
                    noticeData = metadataFiles[eventId];
                }

                if (noticeData) {
                    console.log('Found metadata for image:', object.Key, '->', noticeData.title);
                    return {
                        id: object.Key,
                        eventId: noticeData.eventId,
                        title: noticeData.title,
                        description: noticeData.description,
                        category: noticeData.category,
                        date: noticeData.uploadDate,
                        eventDate: noticeData.eventDate,
                        priority: noticeData.priority,
                        imageUrl: noticeData.fileUrl || generatePresignedUrl(object.Key),
                        uploadedBy: noticeData.uploadedBy,
                        fileType: noticeData.fileType,
                        contentType: 'notice'
                    };
                } else {
                    // For files without metadata, create minimal notice entry
                    console.log('Creating minimal notice for file without metadata:', object.Key);

                    // Try to extract title from filename as fallback
                    const filenameParts = object.Key.split('_');
                    const titleFromFilename = filenameParts.length > 2 ?
                        filenameParts.slice(2).join('_').split('.')[0].replace(/_/g, ' ') :
                        'Untitled Notice';

                    return {
                        id: object.Key,
                        eventId: `event_${filenameParts[1] || Date.now()}`,
                        title: titleFromFilename,
                        description: 'No description available',
                        category: 'general',
                        date: object.LastModified.toISOString().split('T')[0],
                        eventDate: object.LastModified.toISOString().split('T')[0],
                        priority: 'normal',
                        imageUrl: generatePresignedUrl(object.Key),
                        uploadedBy: 'Unknown',
                        fileType: 'unknown',
                        contentType: 'notice'
                    };
                }
            } catch (error) {
                console.error('Error loading notice metadata:', error);
                return null;
            }
        });

        const loadedNotices = (await Promise.all(noticePromises)).filter(notice => notice !== null);
        console.log('Final loaded notices:', loadedNotices.length, 'notices');
        return loadedNotices.sort((a, b) => new Date(b.date) - new Date(a.date));

    } catch (error) {
        console.error('Error loading notices from S3:', error);
        return [];
    }
}

// Notices Management
async function loadNotices() {
    const container = document.getElementById('noticesContainer');
    if (container) {
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><p>Loading notices...</p></div>';
    }

    try {
        // First load from localStorage
        const storedNotices = localStorage.getItem(CONFIG.STORAGE_KEYS.NOTICES);
        if (storedNotices) {
            notices = JSON.parse(storedNotices);
            
            // Refresh URLs for S3 images to prevent expiration (Presigned URLs only last 24 hours)
            notices = notices.map(notice => {
                // Try to get S3 key from s3Key property, or fallback to id
                const s3Key = notice.s3Key || notice.id; 
                
                if (s3Key && (s3Key.startsWith('events/') || s3Key.includes('/'))) {
                    console.log('🔄 Refreshing expired URL for:', s3Key);
                    notice.imageUrl = generatePresignedUrl(s3Key);
                    // Ensure s3Key is explicitly set for future cycles
                    notice.s3Key = s3Key;
                }
                return notice;
            });
        }

        // Then try to load from S3
        const s3Notices = await loadNoticesFromS3();

        // Merge S3 and local notices with robust deduplication
        if (s3Notices.length > 0) {
            const allNotices = [...s3Notices, ...notices]; // Prefer S3 version (more recent/official)
            notices = allNotices.filter((notice, index, self) =>
                index === self.findIndex(n => 
                    (n.id === notice.id) || 
                    (n.eventId && notice.eventId && n.eventId === notice.eventId) ||
                    (n.title === notice.title && n.uploadedBy === notice.uploadedBy && n.date === notice.date)
                )
            ).sort((a, b) => new Date(b.date) - new Date(a.date));
        }

        // If still no notices, load mock data
        if (notices.length === 0) {
            notices = await loadMockNotices();
        }

        if (container) {
            renderNotices();
        }
    } catch (error) {
        console.error('Error loading notices:', error);
        if (container) {
            container.innerHTML = '<div class="error"><i class="fas fa-exclamation-triangle"></i><p>Failed to load notices. Please try again.</p></div>';
        }
    }
}

async function loadMockNotices() {
    return [];
}

function renderNotices() {
    const container = document.getElementById('noticesContainer');
    const filteredNotices = filterNotices();

    if (filteredNotices.length === 0) {
        container.innerHTML = '<div class="text-center"><p>No notices found</p></div>';
        return;
    }

    const viewClass = container.classList.contains('list-view') ? 'list-view' : 'grid-view';

    container.innerHTML = filteredNotices.map(notice => `
        <div class="notice-card" onclick="viewNotice('${notice.id}')">
            ${(currentUser && (currentUser.role === 'admin' || notice.uploadedBy === currentUser.email)) ? `
            <button class="notice-delete-btn" title="Delete Notice" onclick="event.stopPropagation(); deleteNotice('${notice.id}')">
                <i class="fas fa-trash-alt"></i>
            </button>
            ` : ''}
            <img src="${getFreshImageUrl(notice)}"
                 alt="${notice.title}"
                 class="notice-image"
                 onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjI1MCIgdmlld0JveD0iMCAwIDQwMCAyNTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMjUwIiBmaWxsPSIjRjVGNUY1Ii8+CjxwYXRoIGQ9Ik0xNTAgMTAwSDI1MFYxNTBIMTUwVjEwMFoiIGZpbGw9IiNDQ0NDQ0MiLz4KPGNpcmNsZSBjeD0iMTIwIiBjeT0iMTI1IiByPSIyMCIgZmlsbD0iI0NDQ0NDQyIvPgo8cGF0aCBkPSJNMTgwIDE2MEgyMjBWMjAwSDE4MFYxNjBaIiBmaWxsPSIjQ0NDQ0NDIi8+CjxwYXRoIGQ9Ik0yNDAgMTYwSDI4MFYyMDBIMjQwVjE2MFoiIGZpbGw9IiNDQ0NDQ0MiLz4KPHRleHQgeD0iMjAwIiB5PSI5MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5OTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5JbWFnZSBOb3QgQXZhaWxhYmxlPC90ZXh0Pgo8L3N2Zz4=';this.onerror=null;this.style.background='#f5f5f5';">
            <div class="notice-content">
                <h3 class="notice-title">${notice.title}</h3>
                <div class="notice-meta">
                    <span class="notice-badge">${notice.category}</span>
                    <span class="notice-badge priority-${notice.priority}">${notice.priority}</span>
                    <span class="notice-date">${formatDate(notice.eventDate || notice.date)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function deleteNotice(noticeId) {
    if (!confirm('Are you sure you want to delete this notice? This action cannot be undone.')) {
        return;
    }

    try {
        const index = notices.findIndex(n => n.id === noticeId);
        if (index === -1) return;

        const notice = notices[index];
        console.log('🗑️ Deleting notice:', notice.title);

        // Remove from local array
        notices.splice(index, 1);
        
        // Update localStorage
        localStorage.setItem(CONFIG.STORAGE_KEYS.NOTICES, JSON.stringify(notices));

        // Note: For a real S3 implementation, we would also call s3Client.deleteObject here
        // For now, we update the local view immediately
        renderNotices();
        updateDashboardStats();
        updateLatestNotices();
        
        showToast('Notice deleted successfully', 'success');

    } catch (error) {
        console.error('Error deleting notice:', error);
        showToast('Failed to delete notice', 'error');
    }
}

function filterNotices() {
    const category = document.getElementById('categoryFilter').value;
    const date = document.getElementById('dateFilter').value;
    const search = document.getElementById('searchNotices').value.toLowerCase();

    return notices.filter(notice => {
        const categoryMatch = category === 'all' || notice.category === category;
        
        // Check both upload date and event date for a match
        const filterDate = date ? new Date(date).toISOString().split('T')[0] : null;
        const uploadDate = notice.date ? new Date(notice.date).toISOString().split('T')[0] : null;
        const eventDate = notice.eventDate ? new Date(notice.eventDate).toISOString().split('T')[0] : null;
        
        const dateMatch = !date || (uploadDate === filterDate) || (eventDate === filterDate);
        const searchMatch = !search ||
            notice.title.toLowerCase().includes(search) ||
            notice.description.toLowerCase().includes(search) ||
            notice.category.toLowerCase().includes(search);

        return categoryMatch && dateMatch && searchMatch;
    });
}

function setupFilters() {
    ['categoryFilter', 'dateFilter', 'searchNotices'].forEach(id => {
        document.getElementById(id).addEventListener('input', renderNotices);
    });
}

// View toggle removed - forced horizontal layout

// Upload Functionality
function setupUploadForm() {
    const form = document.getElementById('uploadForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const fileInput = document.getElementById('noticeFile');
        const file = fileInput.files[0];

        if (!file) {
            showToast('Please select a file to upload', 'error');
            return;
        }

        uploadNotice(formData, file);
    });
}

function uploadNotice(formData, file) {
    // Prevent duplicate uploads (same title, category and exact date)
    const newTitle = formData.get('title');
    const newEventDate = formData.get('eventDate');
    const newCategory = formData.get('category');
    const today = new Date().toISOString().split('T')[0];

    const isDuplicate = notices.some(n => {
        const titleMatch = n.title === newTitle;
        const categoryMatch = n.category === newCategory;
        // Match if event date is same, OR if both have no event date, match by upload date
        const dateMatch = newEventDate ? (n.eventDate === newEventDate) : (n.date === today);
        return titleMatch && categoryMatch && dateMatch;
    });

    if (isDuplicate) {
        showToast('A notice with this title and date already exists. Duplicate upload prevented.', 'warning');
        return;
    }

    if (isUploading) {
        showToast('Upload is already in progress...', 'warning');
        return;
    }

    // Show progress
    isUploading = true;
    const uploadBtn = document.getElementById('uploadBtn');
    const progressSection = document.getElementById('uploadProgress');
    const successSection = document.getElementById('uploadSuccess');

    if (uploadBtn) uploadBtn.disabled = true;
    if (progressSection) progressSection.classList.remove('hidden');

    // Safety timeout: reset upload flag if it takes too long
    const uploadTimeout = setTimeout(() => {
        if (isUploading) {
            console.warn('⚠️ Staff upload timed out');
            isUploading = false;
            if (uploadBtn) uploadBtn.disabled = false;
            if (progressSection) progressSection.classList.add('hidden');
        }
    }, 30000);

    // Upload to AWS S3
    uploadToS3(file, formData, (err, s3Key) => {
        clearTimeout(uploadTimeout);
        isUploading = false;
        if (err) {
            console.error('Upload error:', err);
            showToast('Upload failed: ' + err.message, 'error');
            if (progressSection) progressSection.classList.add('hidden');
            if (uploadBtn) uploadBtn.disabled = false;
            return;
        }

        // Show success
        if (progressSection) progressSection.classList.add('hidden');
        if (successSection) successSection.classList.remove('hidden');

        // Add to notices list
        const newNotice = {
            id: s3Key, // Use S3 Key as ID for consistent refreshing
            s3Key: s3Key, // Store explicitly as well
            title: formData.get('title'),
            category: formData.get('category'),
            date: new Date().toISOString().split('T')[0],
            eventDate: formData.get('eventDate'),
            priority: formData.get('priority'),
            description: formData.get('description'),
            imageUrl: generatePresignedUrl(s3Key),
            uploadedBy: currentUser.email
        };

        notices.unshift(newNotice);
        localStorage.setItem(CONFIG.STORAGE_KEYS.NOTICES, JSON.stringify(notices));

        // Refresh all displays immediately
        updateDashboardStats();
        updateLatestNotices();
        updateUpcomingEvents();

        // Refresh notices page if visible
        const noticesContainer = document.getElementById('noticesContainer');
        if (noticesContainer) {
            renderNotices();
        }

        // Navigate to dashboard to show the new notice
        navigateToSection('dashboard');

        showToast('Notice uploaded successfully!', 'success');
        if (uploadBtn) uploadBtn.disabled = false;

        // Reset form and file inputs
        const uploadForm = document.getElementById('uploadForm');
        if (uploadForm) uploadForm.reset();
        if (typeof clearFileInput === 'function') clearFileInput();
    });
}

function uploadToS3(file, formData, callback) {
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');

    // Generate unique file key - simple structure in raw bucket
    const timestamp = new Date().getTime();
    const sanitizedTitle = formData.get('title').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const fileName = `events/event_${timestamp}_${sanitizedTitle}.${file.name.split('.').pop()}`;

    console.log('🔴 UPLOAD TO S3 FUNCTION CALLED');
    console.log('🔴 File will be stored in events folder as:', fileName);
    console.log('🔴 Bucket:', CONFIG.S3_BUCKET_NAME);
    console.log('📁 Path structure: events/filename.jpg');
    console.log('📝 Metadata will be stored separately in text-data bucket');

    // Prepare event data for S3 metadata
    const eventData = {
        eventId: `event_${timestamp}`,
        title: formData.get('title'),
        description: formData.get('description'),
        category: formData.get('category'),
        eventDate: formData.get('eventDate'),
        priority: formData.get('priority'),
        uploadedBy: currentUser.email,
        uploadDate: new Date().toISOString().split('T')[0]
    };

    // S3 upload parameters - WITH metadata AND public-read access for permanent URLs
    const uploadParams = {
        Bucket: CONFIG.S3_BUCKET_NAME,
        Key: fileName,
        Body: file,
        ContentType: file.type,
        // Removed ACL: 'public-read' because it might cause 403 Access Denied on some bucket configurations
        Metadata: {
            'event-id': eventData.eventId,
            'category': eventData.category,
            'event-date': eventData.eventDate,
            'priority': eventData.priority,
            'uploaded-by': eventData.uploadedBy,
            'upload-date': eventData.uploadDate
        }
    };

    // Upload with progress tracking
    const upload = s3Client.upload(uploadParams);

    upload.on('httpUploadProgress', (progress) => {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        progressFill.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
    });

    upload.send((err, data) => {
        if (err) {
            console.error('S3 upload error:', err);
            callback(new Error('Failed to upload file to S3: ' + err.message));
        } else {
            console.log('✅ File uploaded successfully to raw-data bucket:', data.Location);
            console.log('📝 Metadata is now attached to the S3 object');
            console.log('🤖 Lambda will be triggered automatically and will read metadata from S3 object');

            callback(null, fileName);
        }
    });
}

function storeEventMetadata(eventData, callback) {
    const metadataFileName = `${eventData.eventId}.json`;

    // Store metadata in the text-data bucket
    console.log('📝 Storing metadata in text-data bucket:', CONFIG.S3_TEXT_BUCKET_NAME);
    const metadataParams = {
        Bucket: CONFIG.S3_TEXT_BUCKET_NAME,
        Key: metadataFileName,
        Body: JSON.stringify(eventData, null, 2),
        ContentType: 'application/json',
        Metadata: {
            'event-id': eventData.eventId,
            'content-type': 'event-metadata'
        }
    };

    s3Client.upload(metadataParams, (err, data) => {
        if (err) {
            console.error('Error storing event metadata:', err);
        } else {
            console.log('✅ Event metadata stored successfully in text-data bucket:', data.Location);
        }
        if (callback) callback();
    });
}

// File Upload Setup
function setupFileUpload() {
    const fileUploadArea = document.getElementById('fileUploadArea');
    const fileInput = document.getElementById('noticeFile');
    const removeBtn = document.getElementById('removeFile');

    if (!fileUploadArea) return;

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            showFilePreview(file);
        }
    });

    // Drag and drop
    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('drag-over');
    });

    fileUploadArea.addEventListener('dragleave', () => {
        fileUploadArea.classList.remove('drag-over');
    });

    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            showFilePreview(files[0]);
        }
    });

    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            clearFileInput();
        });
    }
}

function showFilePreview(file) {
    const uploadArea = document.getElementById('fileUploadArea');
    const uploadContent = uploadArea.querySelector('.upload-content');
    const filePreview = document.getElementById('filePreview');
    const fileName = filePreview.querySelector('.file-name');
    const fileSize = filePreview.querySelector('.file-size');

    uploadContent.style.display = 'none';
    filePreview.classList.add('show');
    uploadArea.classList.add('has-file');

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
}

function clearFileInput() {
    const fileInput = document.getElementById('noticeFile');
    const uploadArea = document.getElementById('fileUploadArea');
    const uploadContent = uploadArea.querySelector('.upload-content');
    const filePreview = document.getElementById('filePreview');

    fileInput.value = '';
    uploadContent.style.display = 'block';
    filePreview.classList.remove('show');
    uploadArea.classList.remove('has-file');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Chatbot Functionality
function setupChatForm() {
    console.log('🤖 Setting up chatbot...');
    console.log('🤖 CONFIG.USE_MOCK_CHATBOT:', CONFIG.USE_MOCK_CHATBOT);
    console.log('🤖 Available notices:', notices.length);

    const form = document.getElementById('chatForm');
    const input = document.getElementById('chatInput');

    if (!form) {
        console.error('🤖 Chat form not found!');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = input.value.trim();
        if (!query) return;

        await sendChatMessage(query);
        input.value = '';
    });

    // Quick action buttons
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const query = btn.dataset.query;
            sendChatMessage(query);
        });
    });
}

async function sendChatMessage(query) {
    const messagesContainer = document.getElementById('chatMessages');

    // Add user message
    addMessage(query, 'user');

    // Show typing indicator
    showTypingIndicator();

    try {
        console.log('Sending chatbot query:', query);
        // Call your API Gateway endpoint
        const response = await callChatbotAPI(query);
        console.log('Chatbot response received:', response);

        // Remove typing indicator
        removeTypingIndicator();

        // Add bot response
        addMessage(response, 'bot');

    } catch (error) {
        console.error('Chatbot error:', error);
        removeTypingIndicator();
        addMessage('Sorry, I encountered an error. Please try again.', 'bot');
    }
}

async function askChatbot(question) {
    try {
        const response = await fetch(CONFIG.API_GATEWAY_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ q: question })
        });

        if (!response.ok) {
            throw new Error("API Error: " + response.status);
        }

        const data = await response.json();
        return data.response || data.answer || "I found some information but couldn't format it properly. Please try rephrasing your question.";
    } catch (err) {
        console.error('Chatbot API Error:', err);
        return getFallbackResponse(question);
    }
}

function getFallbackResponse(question) {
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('today') || lowerQuestion.includes('event')) {
        return "I'm currently unable to access the live event database. Please check the Notices section for the latest events and announcements.";
    } else if (lowerQuestion.includes('exam') || lowerQuestion.includes('schedule')) {
        return "For examination schedules and academic information, please visit the Notices section or contact your department office.";
    } else if (lowerQuestion.includes('technical') || lowerQuestion.includes('workshop')) {
        return "Technical events and workshops are regularly posted in the Notices section. Check the 'Technical' category filter to find relevant events.";
    } else if (lowerQuestion.includes('cultural') || lowerQuestion.includes('fest')) {
        return "Cultural events and festivals are announced through the notice board. Look for notices in the 'Cultural' category.";
    } else if (lowerQuestion.includes('placement') || lowerQuestion.includes('job')) {
        return "Placement drives and job opportunities are posted in the 'Placement' category of notices. Check regularly for updates.";
    } else {
        return "🔍 I searched through all available notices but didn't find any matches for your query. Try using keywords like 'workshop', 'exam', 'cultural', 'sports', or ask me about 'today' or 'how many' notices we have!";
    }
}

async function callChatbotAPI(query) {
    console.log('🚀 Lambda-Integrated Chatbot API called with query:', query);

    try {
        // Step 1: Call top3search Lambda to get relevant S3 text data
        const lambdaResults = await callTop3SearchLambda(query);

        if (lambdaResults && lambdaResults.length > 0) {
            console.log('✅ Lambda returned results:', lambdaResults.length);
            // Step 2: Process results with Claude LLM
            return await processLambdaResultsWithClaude(query, lambdaResults);
        } else {
            console.log('⚠️ No results from Lambda, returning fallback response');
            return `📄 I searched through the text files in S3 but couldn't find specific information about "${query}".

🔍 **Search Details:**
• Query: "${query}"
• S3 Bucket: tce-circular-text-data/text/
• Results Found: 0

💡 **Suggestions:**
• Try different keywords related to your question
• Ask about general topics like "workshop", "exam", "cultural events"
• Check if the information you're looking for is available in the uploaded documents`;
        }
    } catch (error) {
        console.error('❌ Lambda chatbot error:', error);
        return `🔍 I encountered an error while searching for information: ${error.message}. Please try again with a different query.`;
    }
}

// Call top3search Lambda function
async function callTop3SearchLambda(query) {
    try {
        console.log('🔍 Calling top3search Lambda with query:', query);

        // Prepare Lambda payload
        const lambdaPayload = {
            action: 'search',
            query: query,
            s3_bucket: CONFIG.S3_TEXT_BUCKET_NAME,
            s3_prefix: 'text/',
            user_email: currentUser?.email || 'anonymous',
            timestamp: new Date().toISOString()
        };

        console.log('📦 Lambda payload:', lambdaPayload);

        // Call Lambda function
        const lambda = new AWS.Lambda({
            region: CONFIG.AWS_REGION,
            accessKeyId: CONFIG.AWS_ACCESS_KEY_ID,
            secretAccessKey: CONFIG.AWS_SECRET_ACCESS_KEY
        });

        const params = {
            FunctionName: 'top3search',
            Payload: JSON.stringify(lambdaPayload)
        };

        console.log('🚀 Invoking Lambda function...');
        const lambdaResponse = await lambda.invoke(params).promise();

        console.log('📋 Lambda response received:', lambdaResponse);

        if (lambdaResponse.Payload) {
            const payload = JSON.parse(lambdaResponse.Payload);
            console.log('📄 Lambda payload parsed:', payload);

            if (payload.results && Array.isArray(payload.results)) {
                console.log('✅ Lambda returned valid results:', payload.results.length);
                return payload.results;
            } else if (payload.statusCode === 200 && payload.body) {
                const body = JSON.parse(payload.body);
                console.log('✅ Lambda returned formatted results:', body);
                return body.results || body;
            } else {
                console.log('⚠️ Lambda returned unexpected format:', payload);
                return [];
            }
        } else {
            console.log('❌ Lambda returned no payload');
            return [];
        }
    } catch (error) {
        console.error('❌ Lambda invocation error:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            stack: error.stack
        });
        throw new Error(`Lambda function error: ${error.message}`);
    }
}

// Process Lambda results with Claude LLM
async function processLambdaResultsWithClaude(query, lambdaResults) {
    try {
        console.log('🤖 Processing Lambda results with Claude...');
        console.log('📊 Results to process:', lambdaResults.length);

        // Prepare context from Lambda results
        let contextText = '';
        if (lambdaResults && lambdaResults.length > 0) {
            contextText = lambdaResults.map((result, index) => {
                return `Document ${index + 1}:\nFile: ${result.fileName || result.filename || 'Unknown'}\nContent: ${result.content || result.text || result.extractedText || 'No content'}\nRelevance Score: ${result.score || result.relevance || 'N/A'}\n---`;
            }).join('\n');
        }

        console.log('📝 Context for Claude:', contextText.substring(0, 200) + '...');

        // Call Claude API with context
        const claudeResponse = await callClaudeAPI(query, contextText);

        return claudeResponse;
    } catch (error) {
        console.error('❌ Claude processing error:', error);
        throw new Error(`Claude LLM error: ${error.message}`);
    }
}

// Call Claude API
async function callClaudeAPI(query, context) {
    try {
        console.log('🧠 Calling Claude API...');

        const prompt = `You are a helpful assistant for TCE (Thiagarajar College of Engineering) students and staff. Based on the following context extracted from college documents and S3 text files, please answer the user's question accurately and helpfully.

CONTEXT FROM COLLEGE DOCUMENTS:
${context}

USER QUESTION: ${query}

Please provide a comprehensive answer based on the context. If the context doesn't contain relevant information, politely say so and suggest what they might look for instead. Be specific about events, dates, and details mentioned in the documents.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CONFIG.CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 1000,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('✅ Claude API response received');

        if (data.content && data.content[0] && data.content[0].text) {
            return data.content[0].text;
        } else {
            throw new Error('Invalid Claude API response format');
        }
    } catch (error) {
        console.error('❌ Claude API error:', error);

        // Fallback response if Claude fails
        if (context && context.includes(query.toLowerCase())) {
            return `📄 I found information about "${query}" in the college documents:\n\n${context.substring(0, 500)}...\n\n📋 Please note: The AI assistant is currently experiencing difficulties. This is a direct excerpt from the documents. For more detailed information, please try again later.`;
        } else {
            return `🔍 I found ${lambdaResults?.length || 0} relevant documents, but I'm having trouble processing them with the AI assistant right now. Please try again in a few moments.`;
        }
    }
}

// Real chatbot function with S3 text extraction
async function askChatbotWithS3(query) {
    try {
        console.log('🤖 Loading extracted text from S3 text bucket...');

        // First, try to load extracted text from S3 text bucket
        const extractedTexts = await loadExtractedTextsFromS3();
        console.log('📄 Loaded extracted texts from S3:', extractedTexts.length);

        // Search through extracted texts for relevant information
        const relevantTexts = searchExtractedTexts(query, extractedTexts);

        // If we found relevant extracted text, use it
        if (relevantTexts.length > 0) {
            let response = `📄 Found information in extracted documents about "${query}":\n\n`;

            relevantTexts.slice(0, 3).forEach((text, index) => {
                response += `${index + 1}. **Document: ${text.fileName}**\n`;
                response += `   📅 Extracted: ${text.extractDate}\n`;
                response += `   📄 Content: ${text.relevantText.substring(0, 300)}...\n\n`;
            });

            response += `💡 This information was extracted from uploaded images/PDFs using AWS Textract technology.\n`;
            response += `📊 Total documents processed: ${extractedTexts.length}`;

            return response;
        }

        // If no relevant extracted text found, try API Gateway (Gemini)
        if (CONFIG.API_GATEWAY_URL) {
            console.log('🤖 Calling API Gateway for Gemini response...');
            const response = await fetch(CONFIG.API_GATEWAY_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ q: query })
            });

            if (response.ok) {
                const data = await response.json();
                return data.response || data.answer || "I found some information but couldn't format it properly.";
            }
        }

        // Fallback to notice data
        return await getNoticeBasedResponse(query);

    } catch (error) {
        console.error('❌ S3 Text Extraction Error:', error);
        return `🔍 I encountered an error while extracting text: ${error.message}. Try searching for general event information.`;
    }
}

// Load extracted texts from S3 text bucket
async function loadExtractedTextsFromS3() {
    try {
        if (!s3Client) {
            console.log('⚠️ S3 client not initialized');
            return [];
        }

        const params = {
            Bucket: CONFIG.S3_TEXT_BUCKET_NAME,
            Prefix: 'text/', // Read from text/ folder where Lambda stores files
            MaxKeys: 100
        };

        const data = await s3Client.listObjectsV2(params).promise();
        console.log('📁 Found S3 text objects:', data.Contents?.length || 0);

        const extractedTexts = [];

        if (data.Contents && data.Contents.length > 0) {
            // Process each text file
            for (const obj of data.Contents) {
                if (obj.Key.endsWith('.txt')) {
                    try {
                        const textData = await s3Client.getObject({
                            Bucket: CONFIG.S3_TEXT_BUCKET_NAME,
                            Key: obj.Key
                        }).promise();

                        const extractedText = JSON.parse(textData.Body.toString());
                        extractedTexts.push({
                            fileName: obj.Key.split('/').pop().replace('.json', ''),
                            extractDate: obj.LastModified,
                            fullText: extractedText.text || extractedText.content || '',
                            metadata: extractedText.metadata || {}
                        });
                    } catch (fileError) {
                        console.warn('⚠️ Error processing file:', obj.Key, fileError.message);
                    }
                }
            }
        }

        // If no S3 data found, return mock data for testing
        if (extractedTexts.length === 0) {
            console.log('📄 No S3 text data found, using mock extracted texts');
            return getMockExtractedTexts();
        }

        return extractedTexts;

    } catch (error) {
        console.error('❌ Error loading from S3:', error);
        return getMockExtractedTexts();
    }
}

// Mock extracted texts for testing (when S3 is not available)
function getMockExtractedTexts() {
    return [
        {
            fileName: 'AI_Workshop_Poster',
            extractDate: new Date('2024-12-25'),
            fullText: 'Hands-on AI Workshop covering Python programming, machine learning algorithms, neural networks, and deep learning applications. Participants will work on real-world projects using TensorFlow, scikit-learn, and data visualization techniques. Topics include supervised learning, unsupervised learning, natural language processing, and computer vision applications.',
            metadata: { category: 'technical', type: 'workshop' }
        },
        {
            fileName: 'Cultural_Festival_2024',
            extractDate: new Date('2024-12-28'),
            fullText: 'Annual cultural festival featuring music concerts, dance competitions, dramatic performances, fashion show, and food festival. Events include solo singing, group dance, instrumental music, skit competition, and fashion runway. Special celebrity guest performance and prize money worth Rs.50,000 for various events. Open to all students from different colleges.',
            metadata: { category: 'cultural', type: 'festival' }
        },
        {
            fileName: 'Campus_Placement_Drive',
            extractDate: new Date('2025-01-20'),
            fullText: 'Mass campus recruitment drive with top IT companies including Infosys, TCS, Wipro, HCL, and emerging startups. Companies hiring software engineers, data analysts, and cloud architects. Eligibility criteria: 60% aggregate, no active arrears. Package ranges from 3.5 LPA to 8 LPA. Registration deadline: January 15, 2025.',
            metadata: { category: 'placement', type: 'recruitment' }
        },
        {
            fileName: 'Sports_Meet_2025',
            extractDate: new Date('2025-01-25'),
            fullText: 'Inter-department sports competition featuring cricket, football, basketball, volleyball, badminton, table tennis, and athletics. Events include 100m, 200m, 400m, 800m, 1500m races, long jump, high jump, shot put, and relay races. Individual and team championships with medals and trophies.',
            metadata: { category: 'sports', type: 'competition' }
        },
        {
            fileName: 'End_Semester_Exams',
            extractDate: new Date('2025-01-15'),
            fullText: 'Even semester examinations for all engineering departments. Computer Science: Jan 15-20, Mechanical: Jan 22-27, EEE: Jan 29-Feb 3, ECE: Feb 5-10, Civil: Feb 12-17. Students must carry hall tickets, ID cards, and necessary stationery. Strict dress code enforced. No electronic devices allowed in examination halls.',
            metadata: { category: 'academic', type: 'examination' }
        }
    ];
}

// Search through extracted texts for relevant information
function searchExtractedTexts(query, extractedTexts) {
    const lowerQuery = query.toLowerCase();
    const results = [];

    extractedTexts.forEach(text => {
        const textLower = text.fullText.toLowerCase();
        const fileNameLower = text.fileName.toLowerCase();

        // Enhanced keyword matching
        let relevanceScore = 0;
        let relevantText = '';

        // Direct keyword matching in text
        const keywords = lowerQuery.split(' ').filter(word => word.length > 2);
        keywords.forEach(keyword => {
            if (textLower.includes(keyword)) {
                relevanceScore += 3;
                // Extract relevant context around the keyword
                const index = textLower.indexOf(keyword);
                const start = Math.max(0, index - 100);
                const end = Math.min(textLower.length, index + 200);
                relevantText = text.fullText.substring(start, end);
            }
        });

        // Category matching
        if (text.metadata.category && text.metadata.category.includes(lowerQuery)) {
            relevanceScore += 5;
            relevantText = text.fullText.substring(0, 400);
        }

        // Filename matching
        if (fileNameLower.includes(lowerQuery)) {
            relevanceScore += 2;
        }

        // Conceptual matching
        const concepts = {
            'workshop': ['workshop', 'hands-on', 'training', 'practical', 'learning'],
            'festival': ['festival', 'cultural', 'celebration', 'events', 'competition'],
            'exam': ['exam', 'examination', 'test', 'schedule', 'semester'],
            'placement': ['placement', 'job', 'career', 'recruitment', 'company'],
            'sports': ['sports', 'meet', 'competition', 'games', 'athletics']
        };

        Object.keys(concepts).forEach(concept => {
            if (lowerQuery.includes(concept)) {
                concepts[concept].forEach(relatedWord => {
                    if (textLower.includes(relatedWord)) {
                        relevanceScore += 2;
                    }
                });
            }
        });

        if (relevanceScore > 0) {
            results.push({
                fileName: text.fileName,
                extractDate: text.extractDate.toLocaleDateString(),
                relevantText: relevantText || text.fullText.substring(0, 400),
                relevanceScore: relevanceScore,
                metadata: text.metadata
            });
        }
    });

    // Sort by relevance score
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return results;
}

// Response based on notice data (fallback)
async function getNoticeBasedResponse(query) {
    const lowerQuery = query.toLowerCase();
    let noticesResponse = '';

    if (notices && notices.length > 0) {
        const matchingNotices = notices.filter(notice => {
            const titleMatch = notice.title && notice.title.toLowerCase().includes(lowerQuery);
            const categoryMatch = notice.category && notice.category.toLowerCase().includes(lowerQuery);
            const descMatch = notice.description && notice.description.toLowerCase().includes(lowerQuery);
            return titleMatch || categoryMatch || descMatch;
        });

        if (matchingNotices.length > 0) {
            noticesResponse = `\n\n📋 Found ${matchingNotices.length} notice(s) in the system:\n`;
            matchingNotices.slice(0, 2).forEach((notice, index) => {
                noticesResponse += `${index + 1}. ${notice.title} (${notice.category})\n`;
                if (notice.description && notice.description.length > 0) {
                    noticesResponse += `   📄 ${notice.description.substring(0, 100)}...\n`;
                }
            });
        }
    }

    return `🔍 I searched through extracted documents and notices for "${query}".${noticesResponse}\n\n💡 Try asking about specific events like 'workshop', 'festival', 'exam', or 'placement'`;
}

function getMockResponse(query) {
    const lowerQuery = query.toLowerCase();
    console.log('🤖 Chatbot searching for:', lowerQuery);
    console.log('🤖 Available notices:', notices.length);

    // Enhanced search in titles, descriptions, categories, and event dates
    const matchingNotices = notices.filter(notice => {
        const titleMatch = notice.title && notice.title.toLowerCase().includes(lowerQuery);
        const descMatch = notice.description && notice.description.toLowerCase().includes(lowerQuery);
        const categoryMatch = notice.category && notice.category.toLowerCase().includes(lowerQuery);
        const dateMatch = notice.eventDate && notice.eventDate.includes(lowerQuery);
        return titleMatch || descMatch || categoryMatch || dateMatch;
    });

    console.log('🤖 Found matching notices:', matchingNotices.length);

    if (matchingNotices.length > 0) {
        let response = `🎯 I found ${matchingNotices.length} notice(s) related to "${query}":\n\n`;

        matchingNotices.slice(0, 5).forEach((notice, index) => {
            response += `${index + 1}. **${notice.title}**\n`;
            response += `   📅 Event Date: ${notice.eventDate || notice.date}\n`;
            response += `   📁 Category: ${notice.category}\n`;
            response += `   ⚡ Priority: ${notice.priority}\n`;
            if (notice.description && notice.description.length > 0) {
                response += `   📄 Description: ${notice.description.substring(0, 100)}...\n`;
            }
            response += `\n`;
        });

        if (matchingNotices.length > 5) {
            response += `\nAnd ${matchingNotices.length - 5} more results...`;
        }

        response += `\n💡 Click on any notice in the Notices section to see full details!`;
        return response;
    }

    // Enhanced smart responses
    if (lowerQuery.includes('help')) {
        return "🔍 I can help you search notices! Try keywords like:\n• 'workshop', 'exam', 'cultural', 'sports'\n• 'today', 'tomorrow', 'this week'\n• 'academic', 'technical', 'placement'\n• Or ask about specific topics!";
    }

    if (lowerQuery.includes('today') || lowerQuery.includes('now')) {
        const todayEvents = notices.filter(n => n.eventDate === new Date().toISOString().split('T')[0]);
        if (todayEvents.length > 0) {
            return `📅 Today's events (${todayEvents.length}):\n\n${todayEvents.map(n => `• ${n.title}`).join('\n')}`;
        }
        return "📅 No events scheduled for today. Check upcoming events in the Dashboard!";
    }

    if (lowerQuery.includes('how many') || lowerQuery.includes('total')) {
        return `📊 There are currently ${notices.length} notices in the system.\n\nCategories:\n• Academic: ${notices.filter(n => n.category === 'academic').length}\n• Technical: ${notices.filter(n => n.category === 'technical').length}\n• Cultural: ${notices.filter(n => n.category === 'cultural').length}\n• Sports: ${notices.filter(n => n.category === 'sports').length}\n• Volunteer: ${notices.filter(n => n.category === 'volunteer').length}`;
    }

    // Fallback with suggestions
    const categories = ['academic', 'technical', 'cultural', 'sports', 'placement'];
    const suggestions = categories.filter(cat => lowerQuery.includes(cat));

    if (suggestions.length === 0) {
        return `🔍 I searched for "${query}" but found no matches.\n\n💡 Suggestions:\n• Try 'help' for search tips\n• Try categories: academic, technical, cultural, sports\n• Try 'today' for current events\n• Try 'how many' for statistics\n\n📊 Total available notices: ${notices.length}`;
    }

    return `🔍 No exact matches found for "${query}". Try more specific keywords or ask for help!`;
}

function addMessage(content, type) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;

    messageDiv.innerHTML = `
        <div class="message-avatar">
            <i class="fas fa-${type === 'user' ? 'user' : 'robot'}"></i>
        </div>
        <div class="message-content">
            <p>${content}</p>
        </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTypingIndicator() {
    const messagesContainer = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message typing-indicator';
    typingDiv.id = 'typingIndicator';

    typingDiv.innerHTML = `
        <div class="message-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

function initializeChatbot() {
    // Test API connectivity
    testChatbotAPI();
}

async function testChatbotAPI() {
    try {
        console.log('Testing chatbot API...');
        const response = await fetch(CONFIG.API_GATEWAY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ q: 'test' })
        });

        console.log('API Response Status:', response.status);
        const data = await response.text();
        console.log('API Response:', data);

        if (response.ok) {
            addMessage('✅ Chatbot is connected and ready!', 'bot');
        } else {
            addMessage('⚠️ Chatbot API is having issues. Using offline mode.', 'bot');
        }
    } catch (error) {
        console.error('API Test Error:', error);
        addMessage('⚠️ Chatbot is in offline mode. I can still help with basic questions!', 'bot');
    }
}

// Volunteer System
let volunteerFormsSetup = false; // Flag to prevent duplicate setup

function setupVolunteerForm() {
    console.log('🔧 setupVolunteerForm() called, volunteerFormsSetup =', volunteerFormsSetup);

    // Prevent multiple setup calls completely
    if (volunteerFormsSetup) {
        console.log('⚠️ setupVolunteerForm() returning early - already setup');
        return;
    }

    // Setup volunteer request form (for students applying)
    const requestForm = document.getElementById('volunteerForm');
    console.log('📝 Found requestForm:', !!requestForm);

    if (requestForm) {
        // Remove ALL existing event listeners AND prevent bubbling
        const newRequestForm = requestForm.cloneNode(true);
        requestForm.parentNode.replaceChild(newRequestForm, requestForm);

        // Get the new form reference
        const freshRequestForm = document.getElementById('volunteerForm');

        // Use event capturing to ensure our handler runs first
        freshRequestForm.addEventListener('submit', function (e) {
            console.log('🎯 INLINE REQUEST HANDLER CALLED');
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // Load latest volunteers data before submitting
            const storedVolunteers = localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS);
            if (storedVolunteers) {
                volunteers = JSON.parse(storedVolunteers);
            }

            // Call the actual handler
            handleVolunteerSubmit(e);
        }, true);

        console.log('✅ Volunteer request form submit listener added (inline capturing)');
    }

    // Setup volunteer upload form (for approved volunteers)
    const uploadForm = document.getElementById('volunteerUploadForm');
    console.log('📝 Found uploadForm:', !!uploadForm);

    if (uploadForm) {
        // Remove ALL existing event listeners AND prevent bubbling
        const newUploadForm = uploadForm.cloneNode(true);
        uploadForm.parentNode.replaceChild(newUploadForm, uploadForm);

        // Get the new form reference
        const freshUploadForm = document.getElementById('volunteerUploadForm');

        // Use event capturing to ensure our handler runs first
        freshUploadForm.addEventListener('submit', function (e) {
            console.log('🎯 INLINE UPLOAD HANDLER CALLED');
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // Call the actual handler
            handleVolunteerUpload(e);
        }, true);

        console.log('✅ Upload form submit listener added (inline capturing)');
    }

    if (!requestForm && !uploadForm) {
        console.log('❌ Neither volunteer form found, cannot setup');
        return;
    }

    // Mark forms as setup to prevent multiple setup attempts
    volunteerFormsSetup = true;
    console.log('✅ setupVolunteerForm() completed, volunteerFormsSetup =', volunteerFormsSetup);
}

// Separate handler functions to allow proper event listener removal
function handleVolunteerSubmit(e) {
    e.preventDefault();
    submitVolunteerRequest(new FormData(e.target));
}

function handleVolunteerUpload(e) {
    console.log('🚀 handleVolunteerUpload called');
    e.preventDefault();

    // Double-check volunteer status before upload
    const isApprovedVolunteer = volunteers.some(v =>
        v.email === currentUser.email && v.status === 'approved'
    );

    if (!isApprovedVolunteer) {
        showToast('You must be an approved volunteer to upload events.', 'error');
        return;
    }

    // Get the submit button and disable it to prevent multiple clicks
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalContent = submitBtn.innerHTML;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

    console.log('🎯 About to call uploadEventPoster');
    uploadEventPoster(new FormData(e.target), () => {
        console.log('🔄 Upload completed, re-enabling button');
        // Re-enable button after upload completes
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalContent;
    });
}

function submitVolunteerRequest(formData) {
    try {
        console.log('🚀 Submitting volunteer request for:', currentUser.email);

        // First, reload volunteers from localStorage to get latest data
        const storedVolunteers = localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS);
        if (storedVolunteers) {
            volunteers = JSON.parse(storedVolunteers);
            console.log('📥 Reloaded volunteers data:', volunteers.length);
        }

        // Check if user already has a request
        const existingRequest = volunteers.find(v => v.email === currentUser.email);
        if (existingRequest && existingRequest.status === 'pending') {
            showToast('You already have a pending volunteer request. Please wait for admin approval.', 'warning');
            return;
        }

        let application;

        if (existingRequest && (existingRequest.status === 'rejected' || existingRequest.status === 'approved')) {
            // Update existing request (for resubmissions)
            application = updateExistingRequest(existingRequest.id, formData);
            if (!application) {
                showToast('Error updating your application. Please try again.', 'error');
                return;
            }
            console.log('📝 Updating existing volunteer application:', application);
        } else {
            // Create new application
            application = {
                id: Date.now().toString(),
                name: formData.get('volunteerName') || currentUser.name,
                email: currentUser.email,
                rollNumber: formData.get('volunteerRoll'),
                phone: formData.get('volunteerPhone'),
                department: formData.get('volunteerDepartment'),
                year: formData.get('volunteerYear'),
                club: formData.get('volunteerClub'),
                reason: formData.get('volunteerReason'),
                status: 'pending',
                appliedAt: new Date().toISOString(),
                rejectionReason: null
            };
            console.log('📝 Creating new volunteer application:', application);
            volunteers.push(application);
        }
        localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(volunteers));

        console.log('💾 Saved volunteers to localStorage:', volunteers.length);

        const successMessage = existingRequest && existingRequest.status === 'rejected'
            ? 'Application resubmitted successfully! Your updated request is now pending admin approval.'
            : 'Application submitted successfully! Waiting for admin approval.';

        showToast(successMessage, 'success');

        // Reset form
        document.getElementById('volunteerForm').reset();
        document.getElementById('volunteerRequestForm').classList.add('hidden');

        // Update status to show "Pending" and keep user on volunteer section
        updateVolunteerStatus();

        // Ensure user stays on volunteer section and updates immediately
        setTimeout(() => {
            navigateToSection('volunteer');
            // Force update of volunteer status one more time to ensure UI is current
            updateVolunteerStatus();
            console.log('✅ Volunteer form submission completed successfully');
        }, 500);

    } catch (error) {
        console.error('❌ Error submitting volunteer request:', error);
        showToast('Failed to submit application. Please try again.', 'error');
    }
}

function uploadEventPoster(formData, onCompleteCallback) {
    console.log('🚀 Starting volunteer event upload - call count:', uploadEventPoster.callCount);

    // Track call count
    uploadEventPoster.callCount = (uploadEventPoster.callCount || 0) + 1;

    // Prevent multiple simultaneous uploads
    if (isUploading) {
        console.log('⚠️ Upload already in progress, preventing duplicate');
        showToast('Upload is already in progress. Please wait...', 'warning');
        return;
    }

    // Check if user is an approved volunteer
    const isApprovedVolunteer = volunteers.some(v =>
        v.email === currentUser.email && v.status === 'approved'
    );

    if (!isApprovedVolunteer) {
        console.error('🔴 User is not an approved volunteer');
        showToast('You must be an approved volunteer to upload events. Please submit a volunteer request first.', 'error');
        return;
    }

    // Check for duplicates
    const isDuplicate = notices.some(n => 
        n.title === formData.get('title') && 
        n.category === formData.get('category') && 
        n.eventDate === formData.get('eventDate')
    );

    if (isDuplicate) {
        showToast('A notice with this title and date already exists. Duplicate upload prevented.', 'warning');
        isUploading = false;
        return;
    }

    console.log('✅ User is approved volunteer, proceeding with upload');

    // Reset upload flag after a delay (in case of errors)
    setTimeout(() => {
        if (isUploading) {
            console.log('⚠️ Upload flag reset due to timeout');
            isUploading = false;
        }
    }, 30000); // 30 second timeout

    const file = document.getElementById('eventPoster').files[0];
    if (!file) {
        console.error('🔴 No file selected for upload');
        showToast('Please select a poster file', 'error');
        isUploading = false; // Reset flag
        return;
    }

    console.log('🚀 File selected:', file.name, 'Size:', file.size, 'Type:', file.type);
    console.log('🚀 Current user:', currentUser);

    // Upload to S3 - USE EXACTLY SAME FUNCTION AS ADMIN UPLOAD
    uploadToS3(file, formData, (err, s3Key) => {
        // Reset upload flag regardless of outcome
        isUploading = false;

        if (err) {
            console.error('Error uploading event:', err);
            showToast('Upload failed: ' + err.message, 'error');

            // Call the completion callback if provided (even on error)
            if (onCompleteCallback) {
                onCompleteCallback();
            }
            return;
        }

        console.log('🚀 Volunteer upload successful, using same storage as admin uploads');
        console.log('🚀 S3 key:', s3Key);

        // Create notice entry - USE S3 KEY AS ID
        const newNotice = {
            id: s3Key, 
            s3Key: s3Key,
            title: formData.get('title'),
            category: formData.get('category'),
            date: new Date().toISOString().split('T')[0],
            eventDate: formData.get('eventDate'),
            priority: formData.get('priority'),
            description: formData.get('description'),
            imageUrl: generatePresignedUrl(s3Key),
            uploadedBy: currentUser.email
        };

        console.log('🚀 Created notice (EXACT SAME AS ADMIN):', newNotice);

        // Add to main notices list (EXACT SAME AS ADMIN UPLOAD)
        notices.unshift(newNotice);
        localStorage.setItem(CONFIG.STORAGE_KEYS.NOTICES, JSON.stringify(notices));

        // Refresh all displays immediately (EXACT SAME AS ADMIN UPLOAD)
        updateDashboardStats();
        updateLatestNotices();
        updateUpcomingEvents();

        // Refresh notices page if visible
        const noticesContainer = document.getElementById('noticesContainer');
        if (noticesContainer) {
            renderNotices();
        }

        showToast('Event uploaded and published successfully! Now visible in all dashboards.', 'success');

        // Reset form and file inputs
        const volunteerUploadForm = document.getElementById('volunteerUploadForm');
        if (volunteerUploadForm) {
            volunteerUploadForm.reset();
            // Clear file preview if any
            const uploadArea = document.getElementById('fileUploadArea');
            if (uploadArea) {
                uploadArea.classList.remove('has-file');
                const preview = document.getElementById('filePreview');
                if (preview) preview.classList.remove('show');
                const content = uploadArea.querySelector('.upload-content');
                if (content) content.style.display = 'block';
            }
        }

        // Also save to volunteer uploads for admin review
        const volunteerUpload = {
            id: Date.now().toString(),
            fileName: file.name,
            s3Key: s3Key,
            title: formData.get('title'),
            description: formData.get('description'),
            category: formData.get('category'),
            priority: formData.get('priority'),
            eventDate: formData.get('eventDate'),
            uploadDate: new Date().toISOString(),
            status: 'active',
            uploadedBy: currentUser.email,
            fileUrl: newNotice.imageUrl
        };

        const uploads = JSON.parse(localStorage.getItem('volunteer_uploads') || '[]');
        uploads.push(volunteerUpload);
        localStorage.setItem('volunteer_uploads', JSON.stringify(uploads));

        loadMyUploads();

        // Call the completion callback if provided
        if (onCompleteCallback) {
            onCompleteCallback();
        }
    });
}


function loadVolunteerData() {
    // Always reload volunteers from localStorage to get latest data
    const storedVolunteers = localStorage.getItem(CONFIG.STORAGE_KEYS.VOLUNTEERS);
    if (storedVolunteers) {
        volunteers = JSON.parse(storedVolunteers);
    }

    // For admin users, show volunteer management interface
    if (currentUser && currentUser.role === 'admin') {
        showVolunteerRequests();
    } else if (currentUser && currentUser.role === 'student') {
        // Double check student role before showing user status
        updateVolunteerStatus();
        loadStudentNotifications();
    }
}

function loadStudentNotifications() {
    if (!currentUser || currentUser.role !== 'student') return;

    const notifications = JSON.parse(localStorage.getItem('volunteer_notifications') || '[]');
    const userNotifications = notifications.filter(n => n.email === currentUser.email && !n.read);

    const notificationsContainer = document.getElementById('studentNotifications');

    if (userNotifications.length > 0) {
        notificationsContainer.innerHTML = `
            <div class="notification-badge">
                <span class="badge-count">${userNotifications.length}</span>
                <span class="badge-text">New Notification${userNotifications.length > 1 ? 's' : ''}</span>
            </div>
        `;

        // Show notification popups
        userNotifications.forEach(notification => {
            showNotificationPopup(notification);
            // Mark as read
            notification.read = true;
        });

        // Update localStorage
        localStorage.setItem('volunteer_notifications', JSON.stringify(notifications));
    } else {
        notificationsContainer.innerHTML = '';
    }

    console.log('📬 Loaded student notifications:', userNotifications.length);
}

function showNotificationPopup(notification) {
    const message = notification.type === 'accepted'
        ? `🎉 Congratulations ${notification.studentName}! Your volunteer request has been accepted. You can now upload events.`
        : `❌ Sorry ${notification.studentName}, your volunteer request has been rejected${notification.reason ? '. Reason: ' + notification.reason : '.'}`;

    // Show toast notification
    showToast(message, notification.type === 'accepted' ? 'success' : 'error');

    console.log('🔔 Showed notification popup:', notification);
}

function showVolunteerRequests(view = 'pending') {
    // Update state
    showVolunteerRequests.currentView = view;
    
    const requests = volunteers.filter(v => v.status === 'pending');
    
    // IMPORTANT: Write to the dedicated admin container, NOT the whole page container
    const container = document.getElementById('adminVolunteerManagementContainer');

    if (!container) return;
    
    // Make the admin container visible
    container.classList.remove('hidden');
    container.style.marginTop = '20px';
    container.innerHTML = `
        <div class="section-header">
            <h1><i class="fas fa-hands-helping"></i> Volunteer Requests</h1>
            <p>Review and manage volunteer access requests from students</p>
        </div>
        
        <div id="adminVolunteerManagement">
            <div class="requests-summary">
                <div class="summary-card-wrapper">
                    <div class="summary-card">
                        <i class="fas fa-clock"></i>
                        <h3>${requests.length}</h3>
                        <p>Pending Requests</p>
                    </div>
                    <div class="view-all-placeholder"></div>
                </div>
                <div class="summary-card-wrapper">
                    <div class="summary-card clickable" onclick="navigateToSection('approvedVolunteers')">
                        <i class="fas fa-users"></i>
                        <h3>${volunteers.filter(v => v.status === 'approved').length}</h3>
                        <p>Approved Volunteers</p>
                    </div>
                    <button class="btn-view-all-link" onclick="navigateToSection('approvedVolunteers')">
                        View All <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>

            ${requests.length === 0 ?
            `<div class="no-requests">
                    <i class="fas fa-inbox"></i>
                    <h3>No Pending Requests</h3>
                    <p>There are no volunteer requests waiting for approval.</p>
                </div>` :
            `<div class="requests-table-container">
                    <table class="requests-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Department</th>
                                <th>Club/Organization</th>
                                <th>Applied Date</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="volunteerRequestsTable">
                            ${requests.map(request => `
                                <tr>
                                    <td>${request.name}</td>
                                    <td>${request.email}</td>
                                    <td>${request.department || 'N/A'}</td>
                                    <td>${request.club || 'N/A'}</td>
                                    <td>${formatDate(request.appliedAt || request.date)}</td>
                                    <td><span class="status-badge pending">Pending</span></td>
                                    <td>
                                        <button class="btn-small btn-primary" onclick="approveVolunteer('${request.id}')">
                                            <i class="fas fa-check"></i> Approve
                                        </button>
                                        <button class="btn-small btn-danger" onclick="rejectVolunteer('${request.id}')">
                                            <i class="fas fa-times"></i> Reject
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`
            }
        </div>

        <div id="approvedVolunteersSection" class="hidden">
            <div class="section-actions" style="margin-top: 20px; display: flex; align-items: center; gap: 20px;">
                <button class="btn-back" onclick="showVolunteerRequests('pending')">
                    <i class="fas fa-chevron-left"></i> Back to Requests
                </button>
                <h3>Approved Volunteers List</h3>
            </div>

            <div class="filters-container" style="display: flex; gap: 15px; margin: 20px 0;">
                <div class="search-group" style="flex: 1; position: relative;">
                    <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #95a5a6;"></i>
                    <input type="text" id="searchApprovedVolunteers" placeholder="Search by name or email..." class="search-input" style="width: 100%; padding: 10px 10px 10px 40px; border: 1px solid #ddd; border-radius: 8px;">
                </div>
                <div class="filter-group">
                    <select id="deptFilterApproved" class="filter-select" style="padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
                        <option value="all">All Departments</option>
                        <option value="cse">CSE</option>
                        <option value="ece">ECE</option>
                        <option value="eee">EEE</option>
                        <option value="mech">Mech</option>
                        <option value="civil">Civil</option>
                    </select>
                </div>
            </div>

            <div class="requests-table-container">
                <table class="requests-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Roll Number</th>
                            <th>Department</th>
                            <th>Approval Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="approvedVolunteersTableBody">
                        <!-- Dynamic content -->
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Toggle visibility based on view
    if (view === 'approved') {
        document.getElementById('adminVolunteerManagement').classList.add('hidden');
        document.getElementById('approvedVolunteersSection').classList.remove('hidden');
        loadApprovedVolunteers();
    } else {
        document.getElementById('adminVolunteerManagement').classList.remove('hidden');
        document.getElementById('approvedVolunteersSection').classList.add('hidden');
    }
}

function loadAdminData() {
    if (currentUser && currentUser.role === 'admin') {
        loadVolunteerRequests();
        updateAdminStats();
    }
}

function loadVolunteerRequests() {
    const tbody = document.getElementById('volunteerRequestsTable');
    if (!tbody) {
        console.warn('⚠️ volunteerRequestsTable not found in DOM');
        return;
    }
    const requests = volunteers.filter(v => v.status === 'pending');

    if (requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No pending requests</td></tr>';
        return;
    }

    tbody.innerHTML = requests.map(request => `
        <tr>
            <td>${request.name}</td>
            <td>${request.email}</td>
            <td>${request.department}</td>
            <td>${request.club}</td>
            <td>${formatDate(request.appliedAt)}</td>
            <td><span class="status-badge ${request.status}">${request.status}</span></td>
            <td>
                <button class="btn-small btn-primary" onclick="approveVolunteer('${request.id}')">
                    <i class="fas fa-check"></i> Approve
                </button>
                <button class="btn-small btn-danger" onclick="rejectVolunteer('${request.id}')">
                    <i class="fas fa-times"></i> Reject
                </button>
            </td>
        </tr>
    `).join('');
}

function approveVolunteer(requestId) {
    const volunteer = volunteers.find(v => v.id === requestId);
    if (volunteer) {
        volunteer.status = 'approved';
        volunteer.approvedAt = new Date().toISOString();
        volunteer.approvedBy = currentUser.email;

        localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(volunteers));

        // Create notification for the student
        createStudentNotification(volunteer.email, 'Volunteer Request Approved', 
            `Congratulations! Your volunteer request has been approved. You can now upload events.`);

        loadVolunteerRequests();
        if (typeof showVolunteerRequests === 'function' && currentUser.role === 'admin') {
            showVolunteerRequests(showVolunteerRequests.currentView || 'pending');
        }
        updateAdminStats();
        showToast(`Approved ${volunteer.name} as volunteer`, 'success');

        // If the approved volunteer is the current user (unlikely but possible for testing),
        // update their status immediately
        if (currentUser && currentUser.email === volunteer.email) {
            updateVolunteerStatus();
        }
    }
}

function rejectVolunteer(requestId) {
    const volunteer = volunteers.find(v => v.id === requestId);

    if (volunteer) {
        volunteer.status = 'rejected';
        volunteer.rejectedAt = new Date().toISOString();
        volunteer.rejectedBy = currentUser.email;
        volunteer.rejectionReason = 'No specific reason provided';

        // Save to localStorage
        localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(volunteers));

        // Create rejection notification for the student
        createStudentNotification(volunteer.email, 'Volunteer Request Rejected',
            `Your volunteer request has been rejected. You can reapply if you wish.`);

        loadVolunteerRequests();
        if (typeof showVolunteerRequests === 'function' && currentUser.role === 'admin') {
            showVolunteerRequests(showVolunteerRequests.currentView || 'pending');
        }
        updateAdminStats();
        showToast(`Rejected ${volunteer.name}'s application and notified student`, 'success');
    }
}

// Function to create student notifications
function createStudentNotification(studentEmail, title, message) {
    try {
        // Get existing notifications for this student
        const notificationsKey = `student_notifications_${studentEmail}`;
        let notifications = JSON.parse(localStorage.getItem(notificationsKey) || '[]');

        // Add new notification
        const notification = {
            id: Date.now().toString(),
            title: title,
            message: message,
            timestamp: new Date().toISOString(),
            read: false
        };

        notifications.unshift(notification); // Add to beginning of array

        // Keep only last 50 notifications per student
        if (notifications.length > 50) {
            notifications = notifications.slice(0, 50);
        }

        // Save notifications
        localStorage.setItem(notificationsKey, JSON.stringify(notifications));

        // Update notification counter if student is currently logged in
        if (currentUser && currentUser.email === studentEmail) {
            loadStudentNotifications();
        }

        console.log('✅ Student notification created:', { studentEmail, title });

    } catch (error) {
        console.error('❌ Error creating student notification:', error);
    }
}

// Function to load student notifications
function loadStudentNotifications() {
    if (!currentUser) return;

    try {
        const notificationsKey = `student_notifications_${currentUser.email}`;
        const notifications = JSON.parse(localStorage.getItem(notificationsKey) || '[]');

        const notificationContainer = document.getElementById('studentNotifications');
        if (notificationContainer) {
            const unreadCount = notifications.filter(n => !n.read).length;

            if (unreadCount > 0) {
                notificationContainer.innerHTML = `
                    <div class="notification-badge" onclick="viewStudentNotifications()">
                        <i class="fas fa-bell"></i>
                        <span class="notification-count">${unreadCount}</span>
                    </div>
                `;
            } else {
                notificationContainer.innerHTML = `
                    <div class="notification-badge" onclick="viewStudentNotifications()">
                        <i class="fas fa-bell"></i>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('❌ Error loading student notifications:', error);
    }
}

// Function to view student notifications
function viewStudentNotifications() {
    if (!currentUser) return;

    try {
        const notificationsKey = `student_notifications_${currentUser.email}`;
        const notifications = JSON.parse(localStorage.getItem(notificationsKey) || '[]');

        if (notifications.length === 0) {
            alert('No notifications');
            return;
        }

        // Create notification popup
        const notificationList = notifications.map(n => `
            <div class="notification-item ${n.read ? 'read' : 'unread'}" onclick="markNotificationAsRead('${n.id}')">
                <div class="notification-title">${n.title}</div>
                <div class="notification-message">${n.message}</div>
                <div class="notification-time">${new Date(n.timestamp).toLocaleString()}</div>
            </div>
        `).join('');

        const popup = document.createElement('div');
        popup.className = 'notification-popup';
        popup.innerHTML = `
            <div class="notification-popup-content">
                <div class="notification-popup-header">
                    <h3>Your Notifications</h3>
                    <button onclick="this.closest('.notification-popup').remove()" class="close-btn">&times;</button>
                </div>
                <div class="notification-list">
                    ${notificationList}
                </div>
            </div>
        `;

        document.body.appendChild(popup);

        // Mark notifications as read after viewing
        setTimeout(() => {
            notifications.forEach(n => n.read = true);
            localStorage.setItem(notificationsKey, JSON.stringify(notifications));
            loadStudentNotifications();
        }, 2000);

    } catch (error) {
        console.error('❌ Error viewing student notifications:', error);
    }
}

// Function to mark notification as read
function markNotificationAsRead(notificationId) {
    if (!currentUser) return;

    try {
        const notificationsKey = `student_notifications_${currentUser.email}`;
        const notifications = JSON.parse(localStorage.getItem(notificationsKey) || '[]');

        const notification = notifications.find(n => n.id === notificationId);
        if (notification) {
            notification.read = true;
            localStorage.setItem(notificationsKey, JSON.stringify(notifications));
            loadStudentNotifications();
        }
    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
    }
}


function updateAdminStats() {
    const approved = volunteers.filter(v => v.status === 'approved').length;
    const pending = volunteers.filter(v => v.status === 'pending').length;
    const uploads = JSON.parse(localStorage.getItem('volunteer_uploads') || '[]').length;

    document.getElementById('approvedVolunteers').textContent = approved;
    document.getElementById('pendingRequests').textContent = pending;
    document.getElementById('totalUploads').textContent = uploads;
}

// Modal Functionality
function setupModal() {
    const modal = document.getElementById('noticeModal');
    const closeBtn = document.getElementById('modalClose');
    const downloadBtn = document.getElementById('downloadNotice');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeModal();
        });
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadNotice);
    }
}

function viewNotice(noticeId) {
    const notice = notices.find(n => n.id === noticeId);
    if (!notice) return;

    const modal = document.getElementById('noticeModal');
    document.getElementById('modalTitle').textContent = notice.title;
    document.getElementById('modalCategory').textContent = notice.category;
    document.getElementById('modalDate').textContent = formatDate(notice.eventDate || notice.date);
    document.getElementById('modalPriority').textContent = notice.priority;
    document.getElementById('modalDescription').textContent = notice.description || 'No description available';
    const modalImg = document.getElementById('modalImage');
    modalImg.src = notice.imageUrl;
    modalImg.onerror = function () {
        this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjUwMCIgdmlld0JveD0iMCAwIDgwMCA1MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI4MDAiIGhlaWdodD0iNTAwIiBmaWxsPSIjRjVGNUY1Ii8+CjxwYXRoIGQ9Ik0zMDAgMjAwSDUwMFYzMDBIMzAwVjIwMFoiIGZpbGw9IiNDQ0NDQ0MiLz4KPGNpcmNsZSBjeD0iMjQwIiBjeT0iMjUwIiByPSI0MCIgZmlsbD0iI0NDQ0NDQyIvPgo8cGF0aCBkPSJNMzYwIDMyMEg0NDBWNDAwSDM2MFYzMjBaIiBmaWxsPSIjQ0NDQ0NDIiLz4KPHA+PHRleHQgeD0iNDAwIiB5PSIxODAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzk5OTk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+SW1hZ2UgTm90IEF2YWlsYWJsZTwvdGV4dD48L3A+Cjwvc3ZnPg==';
        this.onerror = null;
        this.style.background = '#f5f5f5';
    };

    // Set up delete button
    const deleteBtn = document.getElementById('modalDeleteBtn');
    deleteBtn.onclick = () => deleteNotice(noticeId);

    modal.classList.add('show');
}

function closeModal(modalId = 'noticeModal') {
    document.getElementById(modalId).classList.remove('show');
}

function downloadNotice() {
    // Implement download functionality
    const imageUrl = document.getElementById('modalImage').src;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'notice.jpg';
    link.click();
}

function deleteNotice(noticeId) {
    if (!confirm('Are you sure you want to delete this notice?')) return;

    const notice = notices.find(n => n.id === noticeId);
    if (!notice) return;

    // Delete from S3 if it has an S3 key
    if (notice.imageUrl && notice.imageUrl.includes('amazonaws.com')) {
        const s3Key = notice.imageUrl.split('/').pop();
        s3Client.deleteObject({
            Bucket: CONFIG.S3_BUCKET_NAME,
            Key: s3Key
        }, (err) => {
            if (err) console.error('Error deleting from S3:', err);
        });
    }

    // Remove from notices array
    notices = notices.filter(n => n.id !== noticeId);

    // Update localStorage
    localStorage.setItem(CONFIG.STORAGE_KEYS.NOTICES, JSON.stringify(notices));

    // Refresh displays
    updateDashboardStats();
    updateLatestNotices();
    updateUpcomingEvents();

    const noticesContainer = document.getElementById('noticesContainer');
    if (noticesContainer) {
        renderNotices();
    }

    // Close modal and show success
    closeModal();
    showToast('Notice deleted successfully', 'success');
}

// Utility Functions
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

function formatDateTime(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleString('en-US', options);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'check-circle' :
        type === 'error' ? 'exclamation-circle' :
            type === 'warning' ? 'exclamation-triangle' : 'info-circle';

    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function logout() {
    currentUser = null;
    localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);

    // Sign out from Google if available
    if (typeof google !== 'undefined' && google.accounts) {
        try {
            // Reset Google Sign-In session
            google.accounts.id.disableAutoSelect();

            // Clear any stored Google session (revoked method is callback-based, not promise-based)
            if (google.accounts.id.revoke && currentUser?.email) {
                google.accounts.id.revoke(currentUser.email, (done) => {
                    console.log('Google session revoked:', done);
                });
            }
        } catch (error) {
            console.log('Error during Google sign-out:', error);
        }
    }

    showLoginScreen();
    showToast('Logged out successfully', 'success');
}

// Profile and Settings Functions
function loadProfileData() {
    if (!currentUser) return;

    document.getElementById('profileName').textContent = currentUser.name;
    document.getElementById('profileEmail').textContent = currentUser.email;

    const roleElement = document.getElementById('profileRole');
    roleElement.textContent = currentUser.role === 'admin' ? 'Staff Member' : 'Student';
    roleElement.className = `role-badge ${currentUser.role}`;

    const profileAvatar = document.getElementById('profileAvatar');
    if (currentUser.picture && currentUser.picture.startsWith('https://')) {
        profileAvatar.src = currentUser.picture;
    } else {
        const seed = currentUser.name.replace(/\s+/g, '').toLowerCase();
        profileAvatar.src = `https://picsum.photos/seed/${seed}/200/200.jpg`;
    }

    profileAvatar.onerror = function () {
        this.src = 'https://picsum.photos/seed/default-profile/200/200.jpg';
    };

    // Calculate member since date
    const loginDate = new Date(currentUser.loginTime);
    document.getElementById('memberSince').textContent = loginDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Last login (current session)
    document.getElementById('lastLogin').textContent = new Date().toLocaleString();

    // Email status
    document.getElementById('emailStatus').textContent = currentUser.email_verified ? 'Verified ✓' : 'Not Verified';
}

function loadSettingsData() {
    // Load saved settings or use defaults
    const savedSettings = localStorage.getItem('tce_app_settings');
    const settings = savedSettings ? JSON.parse(savedSettings) : {
        emailNotifications: true,
        pushNotifications: true,
        defaultView: 'grid',
        darkMode: false
    };

    document.getElementById('emailNotifications').checked = settings.emailNotifications;
    document.getElementById('pushNotifications').checked = settings.pushNotifications;
    document.getElementById('defaultView').value = settings.defaultView;
    document.getElementById('darkMode').checked = settings.darkMode;
}

function saveSettings() {
    const settings = {
        emailNotifications: document.getElementById('emailNotifications').checked,
        pushNotifications: document.getElementById('pushNotifications').checked,
        defaultView: document.getElementById('defaultView').value,
        darkMode: document.getElementById('darkMode').checked
    };

    localStorage.setItem('tce_app_settings', JSON.stringify(settings));
    showToast('Settings saved successfully!', 'success');
}

function resetSettings() {
    const defaultSettings = {
        emailNotifications: true,
        pushNotifications: true,
        defaultView: 'grid',
        darkMode: false
    };

    localStorage.setItem('tce_app_settings', JSON.stringify(defaultSettings));
    loadSettingsData();
    showToast('Settings reset to default', 'success');
}

// Additional helper functions
function askQuickQuestion(question) {
    navigateToSection('chatbot');
    setTimeout(() => {
        sendChatMessage(question);
    }, 500);
}

// Reset upload form
document.getElementById('uploadAnother')?.addEventListener('click', () => {
    document.getElementById('uploadForm').reset();
    document.getElementById('uploadSuccess').classList.add('hidden');
    clearFileInput();
});

// Test function to force app to show all sections
window.forceShowApp = function () {
    console.log('🚀 Forcing app to show...');

    // Create a mock admin user
    currentUser = {
        email: 'admin@tce.edu',
        name: 'Admin User',
        role: 'admin',
        picture: null
    };

    // Hide loading screen
    document.getElementById('loadingScreen').style.display = 'none';

    // Show main app
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('mainApp').style.display = 'block';

    // Hide login section
    document.getElementById('loginSection').style.display = 'none';

    // Show dashboard by default
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });

    const dashboardSection = document.getElementById('dashboard');
    if (dashboardSection) {
        dashboardSection.classList.add('active');
        dashboardSection.style.display = 'block';
    }

    // Load dashboard data
    loadDashboardData();

    console.log('✅ App forced to show with admin user');
};

// Test function to manually show any section
window.showSection = function (sectionId) {
    // First force the app to show
    window.forceShowApp();

    // Then show the specific section
    setTimeout(() => {
        navigateToSection(sectionId);
    }, 100);
};

// Test function to create mock volunteer requests
window.createMockVolunteerRequests = function () {
    console.log('📝 Creating mock volunteer requests...');

    const mockRequests = [
        {
            id: 'req_' + Date.now() + '_1',
            name: 'Alice Johnson',
            email: 'alice.johnson@student.tce.edu',
            department: 'Computer Science',
            club: 'Coding Club',
            status: 'pending',
            date: new Date().toISOString(),
            appliedAt: new Date().toISOString()
        },
        {
            id: 'req_' + Date.now() + '_2',
            name: 'Bob Smith',
            email: 'bob.smith@student.tce.edu',
            department: 'Electronics',
            club: 'Robotics Club',
            status: 'pending',
            date: new Date().toISOString(),
            appliedAt: new Date().toISOString()
        },
        {
            id: 'req_' + Date.now() + '_3',
            name: 'Carol Williams',
            email: 'carol.williams@student.tce.edu',
            department: 'Mechanical',
            club: 'Technical Association',
            status: 'pending',
            date: new Date().toISOString(),
            appliedAt: new Date().toISOString()
        }
    ];

    // Add to volunteers array
    mockRequests.forEach(request => {
        // Remove any existing request with same email
        volunteers = volunteers.filter(v => v.email !== request.email);
        volunteers.push(request);
    });

    // Save to localStorage
    localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(volunteers));

    console.log('✅ Created 3 mock volunteer requests:', mockRequests);
    console.log('📋 Total volunteers:', volunteers.length);

    // Refresh display if admin user is looking at volunteer section
    if (currentUser && currentUser.role === 'admin') {
        showVolunteerRequests();
    }
};

// Test function to check role-based UI visibility
window.checkRoleBasedUI = function () {
    console.log('🔍 Checking role-based UI visibility...');
    console.log('👤 Current user:', currentUser);
    console.log('👤 User role:', currentUser?.role);
    console.log('👤 User email:', currentUser?.email);

    if (!currentUser) {
        console.log('❌ No current user found');
        return;
    }

    const isAdmin = currentUser.role === 'admin';
    const isStudent = currentUser.role === 'student';
    const isVolunteer = volunteers.some(v => v.email === currentUser.email && v.status === 'approved');

    console.log('🔐 Is Admin:', isAdmin);
    console.log('🎓 Is Student:', isStudent);
    console.log('👥 Is Volunteer:', isVolunteer);

    // Check admin-only elements
    const adminElements = document.querySelectorAll('.admin-only');
    console.log('🔍 Admin-only elements found:', adminElements.length);
    adminElements.forEach((el, index) => {
        const isHidden = el.classList.contains('hidden');
        console.log(`  ${index + 1}. ${el.textContent || el.id} - Hidden: ${isHidden}, Should be hidden: ${!isAdmin}`);
    });

    // Check volunteer-only elements
    const volunteerElements = document.querySelectorAll('.volunteer-only');
    console.log('👥 Volunteer-only elements found:', volunteerElements.length);
    volunteerElements.forEach((el, index) => {
        const isHidden = el.classList.contains('hidden');
        console.log(`  ${index + 1}. ${el.textContent || el.id} - Hidden: ${isHidden}, Should be hidden: ${!isStudent}`);
    });

    // Check volunteer-upload-only elements
    const volunteerUploadElements = document.querySelectorAll('.volunteer-upload-only');
    console.log('📤 Volunteer-upload-only elements found:', volunteerUploadElements.length);
    volunteerUploadElements.forEach((el, index) => {
        const isHidden = el.classList.contains('hidden');
        console.log(`  ${index + 1}. ${el.textContent || el.id} - Hidden: ${isHidden}, Should be hidden: ${!isVolunteer && !isAdmin}`);
    });

    console.log('✅ Role-based UI check completed');
};

// Debug function to test volunteer form submission (can be called from browser console)
window.testVolunteerForm = function () {
    console.log('🧪 Testing volunteer form submission...');

    if (!currentUser) {
        console.log('❌ No current user found');
        alert('Please login first');
        return;
    }

    console.log('👤 Current user:', currentUser);

    // Check if volunteer form exists
    const form = document.getElementById('volunteerForm');
    if (!form) {
        console.log('❌ Volunteer form not found');
        alert('Volunteer form not found');
        return;
    }

    // Fill form with test data
    form.volunteerName.value = currentUser.name;
    form.volunteerRoll.value = 'TEST123';
    form.volunteerDepartment.value = 'cse';
    form.volunteerYear.value = '3';
    form.volunteerClub.value = 'Test Club';
    form.volunteerReason.value = 'This is a test volunteer request for debugging purposes.';

    console.log('📝 Form filled with test data');
    console.log('📋 Current volunteers:', volunteers.length);

    // Submit form
    form.dispatchEvent(new Event('submit'));

    console.log('🚀 Form submitted');
};

// Debug function to test accept/reject functionality (can be called from browser console)
window.testAcceptReject = function () {
    console.log('🧪 Testing accept/reject functionality...');

    if (!currentUser || currentUser.role !== 'admin') {
        console.log('❌ Admin user required for testing');
        alert('Please login as admin to test accept/reject functionality');
        return;
    }

    // Find first pending request
    const pendingRequest = volunteers.find(v => v.status === 'pending');
    if (!pendingRequest) {
        console.log('❌ No pending requests found');
        alert('No pending volunteer requests to test with');
        return;
    }

    console.log('📋 Found pending request:', pendingRequest);

    // Test accepting
    if (confirm(`Test accepting request from ${pendingRequest.name}?`)) {
        acceptVolunteerRequest(pendingRequest.id);
    }
};

// Debug function to create a test pending request
window.createTestPendingRequest = function () {
    console.log('🧪 Creating test pending request...');

    if (!currentUser) {
        console.log('❌ No current user found');
        alert('Please login first');
        return;
    }

    const testRequest = {
        id: 'test_' + Date.now(),
        name: 'Test Student',
        email: 'test.student@student.tce.edu',
        rollNumber: 'TEST001',
        department: 'Computer Science',
        year: '3',
        club: 'Test Club',
        reason: 'This is a test request for debugging the accept/reject functionality.',
        status: 'pending',
        appliedAt: new Date().toISOString(),
        rejectionReason: null
    };

    volunteers.push(testRequest);
    localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(volunteers));

    console.log('✅ Created test pending request:', testRequest);

    // Refresh the volunteer section
    loadAdminVolunteerManagement();

    alert('Test pending request created! Check the admin volunteer section.');
};

// Debug function to test resubmit functionality (can be called from browser console)
window.testResubmit = function () {
    console.log('🧪 Testing resubmit functionality...');

    if (!currentUser) {
        console.log('❌ No current user found');
        alert('Please login first');
        return;
    }

    // Find existing request for current user
    const existingRequest = volunteers.find(v => v.email === currentUser.email);
    if (!existingRequest) {
        console.log('❌ No existing request found for current user');
        alert('No existing request found. Submit a volunteer request first.');
        return;
    }

    console.log('📋 Found existing request:', existingRequest);

    // Simulate rejection
    existingRequest.status = 'rejected';
    existingRequest.rejectionReason = 'Test rejection for debugging resubmit functionality';
    existingRequest.rejectedAt = new Date().toISOString();
    existingRequest.rejectedBy = 'test.admin@tce.edu';

    // Save to localStorage
    localStorage.setItem(CONFIG.STORAGE_KEYS.VOLUNTEERS, JSON.stringify(volunteers));

    console.log('❌ Simulated rejection for:', existingRequest.name);

    // Update UI
    updateVolunteerStatus();

    alert('Your request has been marked as rejected for testing. You can now resubmit the form.');
};

// Debug function to check current volunteer status (can be called from browser console)
window.checkMyStatus = function () {
    console.log('🔍 Checking volunteer status for:', currentUser?.email);

    if (!currentUser) {
        console.log('❌ No current user found');
        return;
    }

    const volunteer = volunteers.find(v => v.email === currentUser.email);
    if (volunteer) {
        console.log('📊 Volunteer Status:', volunteer.status);
        console.log('📅 Applied:', volunteer.appliedAt);
        console.log('✅ Approved:', volunteer.approvedAt);
        console.log('❌ Rejected:', volunteer.rejectedAt);
        console.log('📝 Rejection Reason:', volunteer.rejectionReason);
        console.log('🔄 Resubmitted:', volunteer.resubmitted || false);
    } else {
        console.log('📋 No volunteer request found');
    }

    return volunteer;
};
