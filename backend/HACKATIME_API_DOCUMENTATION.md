# Hackatime API Endpoints

## Overview
These endpoints allow authenticated users to check their Hackatime account status and retrieve their coding statistics and project information.

## Endpoints

### 1. Check Hackatime Account Status

```
GET /api/user/hackatime-account
```

Check if the authenticated user has a Hackatime account linked.

**Response (200 OK):**
```json
{
  "email": "user@example.com",
  "hasHackatimeAccount": true,
  "hackatimeAccountId": "100"
}
```

When no account is linked:
```json
{
  "email": "user@example.com",
  "hasHackatimeAccount": false,
  "hackatimeAccountId": null
}
```

---

### 2. Get Hackatime Projects

```
GET /api/user/hackatime-projects
```

## Authentication
This endpoint requires authentication via the `AuthGuard`. Users must be logged in and have a valid session cookie.

**Required Headers:**
```
Cookie: sessionId=<your-session-id>
```

## Response Format

### Success Response (200 OK)
Returns a JSON object containing the user's Hackatime information:

```json
{
  "user_id": 100,
  "username": "techpixel",
  "projects": [
    {
      "name": "project-name",
      "total_heartbeats": 31773,
      "total_duration": 119828,
      "first_heartbeat": 1738440566.3219998,
      "last_heartbeat": 1755700946.734,
      "languages": ["TypeScript", "JavaScript", "CSS", "HTML"],
      "repo": "https://github.com/username/project-name",
      "repo_mapping_id": 1847
    }
  ],
  "total_projects": 63
}
```

### Error Responses

#### 401 Unauthorized
User is not authenticated or session is invalid.

```json
{
  "statusCode": 401,
  "message": "Session required"
}
```

#### 404 Not Found
User has no Hackatime account linked.

```json
{
  "statusCode": 404,
  "message": "No Hackatime account linked to this user"
}
```

Or user not found:

```json
{
  "statusCode": 404,
  "message": "User not found"
}
```

#### 500 Internal Server Error
Error fetching data from Hackatime API.

```json
{
  "statusCode": 500,
  "message": "Failed to fetch hackatime projects"
}
```

## Field Descriptions

- `user_id`: The Hackatime user ID
- `username`: The user's Hackatime username
- `projects`: Array of project objects
  - `name`: Project name
  - `total_heartbeats`: Total number of coding heartbeats recorded
  - `total_duration`: Total coding duration in seconds
  - `first_heartbeat`: Unix timestamp of first heartbeat
  - `last_heartbeat`: Unix timestamp of last heartbeat
  - `languages`: Array of programming languages used
  - `repo`: GitHub repository URL (may be null)
  - `repo_mapping_id`: Hackatime repository mapping ID (may be null)
- `total_projects`: Total number of projects for the user

## Example Usage

### Check Hackatime Account Status

```bash
curl -X GET "https://api.example.com/api/user/hackatime-account" \
  -H "Cookie: sessionId=your-session-id-here"
```

### Get Hackatime Projects

```bash
curl -X GET "https://api.example.com/api/user/hackatime-projects" \
  -H "Cookie: sessionId=your-session-id-here"
```

### Using JavaScript (Fetch API)

Check account status:
```javascript
fetch('https://api.example.com/api/user/hackatime-account', {
  method: 'GET',
  credentials: 'include',
})
  .then(response => response.json())
  .then(data => console.log('Hackatime status:', data))
  .catch(error => console.error('Error:', error));
```

Get projects:
```javascript
fetch('https://api.example.com/api/user/hackatime-projects', {
  method: 'GET',
  credentials: 'include',
})
  .then(response => response.json())
  .then(data => console.log('Projects:', data))
  .catch(error => console.error('Error:', error));
```

### Using JavaScript (Axios)

Check account status:
```javascript
axios.get('https://api.example.com/api/user/hackatime-account', {
  withCredentials: true
})
  .then(response => console.log('Hackatime status:', response.data))
  .catch(error => console.error('Error:', error));
```

Get projects:
```javascript
axios.get('https://api.example.com/api/user/hackatime-projects', {
  withCredentials: true
})
  .then(response => console.log('Projects:', response.data))
  .catch(error => console.error('Error:', error));
```

## Account Linking Methods

### Automatic Linking (During Signup)

Users are automatically linked to their Hackatime account during signup based on their email address. The system:

1. Checks if a Hackatime account exists with the same email
2. If found, stores the Hackatime user ID in the `hackatime_account` field
3. If not found, leaves the field empty (null)

**Note:** This only works if `HACKATIME_API_KEY` is configured in your `.env` file.

### Manual Linking (OTP Verification)

Users can manually link their Hackatime account using the OTP verification endpoints:

1. User provides their Hackatime email address
2. System sends a 6-digit OTP to that email
3. User enters the OTP code
4. System verifies email ownership and links the account

This method ensures that users can only link accounts they actually control.

## Troubleshooting

### "No Hackatime account linked" Error
 
If you receive this error, it means:
- No Hackatime account was found during initial signup, OR
- The account was never manually linked via OTP

**Solution:** Use the manual linking flow (OTP verification) to link your account.

### "HACKATIME_API_KEY not configured" Warning

This appears in the logs when the API key is not set in your `.env` file.

**Solution:** 
1. Add `HACKATIME_API_KEY` to your root `.env` file
2. Ensure the value is your actual bearer token (starts with `hka_...`)
3. Restart the API service

### "No Hackatime account found with this email" Error

This occurs when:
- The email doesn't exist in the Hackatime database, OR
- The `HACKATIME_API_KEY` is not configured correctly

**Solution:** Verify the email exists in Hackatime and that the API key has proper permissions.

## Configuration

The endpoints require the following environment variables to be set in your root `.env` file:

```bash
# Hackatime Configuration
HACKATIME_ADMIN_API_URL=https://hackatime.hackclub.com/api/admin/v1
HACKATIME_API_KEY=your_hackatime_api_key_here
```

**Important Notes:**
- Add these variables to the root `.env` file (not `backend/.env`)
- The `HACKATIME_ADMIN_API_URL` should be the base URL, not the API key
- The `HACKATIME_API_KEY` should be your actual bearer token
- After updating `.env`, restart the API service to load the new variables

---

### 3. Send Hackatime Link OTP

```
POST /api/user/auth/hackatime-link/send-otp
```

Send a verification code to an email address to link that Hackatime account to your user account.

**Request Body:**
```json
{
  "email": "your-hackatime-email@example.com"
}
```

**Response (200 OK):**
```json
{
  "message": "Verification code sent to your email"
}
```

**Error Responses:**

400 Bad Request - Invalid email format:
```json
{
  "statusCode": 400,
  "message": "Invalid email format"
}
```

---

### 4. Verify Hackatime Link OTP

```
POST /api/user/auth/hackatime-link/verify-otp
```

Verify the OTP code and link your Hackatime account.

**Request Body:**
```json
{
  "otp": "123456"
}
```

**Response (200 OK):**
```json
{
  "message": "Hackatime account linked successfully",
  "hackatimeAccountId": 100
}
```

**Error Responses:**

400 Bad Request - No account found:
```json
{
  "statusCode": 400,
  "message": "No Hackatime account found with this email"
}
```

401 Unauthorized - Invalid or expired OTP:
```json
{
  "statusCode": 401,
  "message": "Invalid or expired verification code"
}
```

## Linking Your Hackatime Account

To link your Hackatime account:

1. Call the send OTP endpoint with your Hackatime email address
2. Check your email for the verification code
3. Call the verify OTP endpoint with the code
4. Your Hackatime account will be linked automatically

Example workflow:
```javascript
// Step 1: Send OTP
await axios.post('/api/user/auth/hackatime-link/send-otp', {
  email: 'your-hackatime-email@example.com'
});

// Step 2: Verify OTP (after receiving email)
await axios.post('/api/user/auth/hackatime-link/verify-otp', {
  otp: '123456'
});
```

## Data Format Notes

### Timestamps
- All timestamps are in Unix format (seconds since epoch)
- Example: `1738440566.3219998` = December 31, 2024

### Duration
- Duration is measured in seconds
- Example: `119828` = ~33.3 hours

### Languages
- Languages array may include empty strings for projects without language detection
- Empty strings represent unknown/mixed language projects

### Repository Information
- Repository information is optional and may be null for local-only projects
- `repo`: GitHub repository URL (if linked)
- `repo_mapping_id`: Hackatime's internal repository mapping ID (if available)

## Database Schema

The Hackatime integration adds the following fields to the `users` table:

- `hackatime_account` (TEXT, nullable): Stores the Hackatime user ID if account is linked

## Email Templates

### Hackatime Link OTP Email
When users request to link their Hackatime account, they receive an email with:
- Subject: "Link Your Hackatime Account"
- Content: 6-digit verification code
- Expiration: 10 minutes

**Metadata Type:** `hackatime-link-otp`

## Security Considerations

- OTP codes expire after 10 minutes
- OTP codes can only be used once
- Users must be authenticated to send/verify OTP codes
- Email verification ensures users can only link accounts they own
- The `hackatimeAccount` field is only populated after successful OTP verification
