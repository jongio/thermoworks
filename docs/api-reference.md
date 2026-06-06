# ThermoWorks Cloud API Reference

> Complete reference for the ThermoWorks Cloud Firebase/Firestore REST API surface.
> Reverse-engineered from the production web app at `cloud.thermoworks.com`.

## Table of Contents

- [Authentication](#authentication)
- [Firestore REST API](#firestore-rest-api)
- [Collections](#collections)
  - [users](#users)
  - [devices](#devices)
  - [devices/{serial}/channels](#devicesserialchannels)
  - [devices/{serial}/archive](#devicesserialarchive)
  - [devices/{serial}/calibration](#devicesserialcalibration)
  - [events](#events)
  - [firmware](#firmware)
  - [accounts](#accounts)
  - [content](#content)
  - [system/billingPlans](#systembillingplans)
  - [releases](#releases)
  - [usersInvites](#usersinvites)
- [Callable Cloud Functions](#callable-cloud-functions)
- [Search API (Typesense)](#search-api-typesense)
- [Firebase Configuration](#firebase-configuration)
- [Data Types & Enums](#data-types--enums)
- [Error Handling](#error-handling)
- [Rate Limits & Quotas](#rate-limits--quotas)

---

## Authentication

ThermoWorks Cloud uses Firebase Authentication with email/password sign-in.

### Sign In

```
POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}
```

**Headers:**
| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `Referer` | `https://cloud.thermoworks.com/` |

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secret",
  "returnSecureToken": true
}
```

**Response (200 OK):**
```json
{
  "kind": "identitytoolkit#VerifyPasswordResponse",
  "localId": "vN6oMM8W2eN8HsUFz0LI2UMu2EX2",
  "email": "user@example.com",
  "displayName": "User Name",
  "idToken": "<JWT access token>",
  "refreshToken": "<refresh token>",
  "registered": true,
  "expiresIn": "3600"
}
```

**Error Response (400):**
```json
{
  "error": {
    "code": 400,
    "message": "EMAIL_NOT_FOUND",
    "errors": [{ "message": "EMAIL_NOT_FOUND", "domain": "global", "reason": "invalid" }]
  }
}
```

**Error codes:** `EMAIL_NOT_FOUND`, `INVALID_PASSWORD`, `USER_DISABLED`, `TOO_MANY_ATTEMPTS_TRY_LATER`

### Token Refresh

```
POST https://securetoken.googleapis.com/v1/token?key={API_KEY}
```

**Request Body:**
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "<refresh token from sign-in>"
}
```

**Response (200 OK):**
```json
{
  "id_token": "<new JWT>",
  "refresh_token": "<new refresh token>",
  "user_id": "vN6oMM8W2eN8HsUFz0LI2UMu2EX2",
  "token_type": "Bearer",
  "expires_in": "3600"
}
```

### Account Lookup

```
POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={API_KEY}
```

**Request Body:**
```json
{
  "idToken": "<JWT>"
}
```

**Response (200 OK):**
```json
{
  "users": [{
    "localId": "vN6oMM8W2eN8HsUFz0LI2UMu2EX2",
    "email": "user@example.com",
    "displayName": "User Name",
    "emailVerified": true,
    "passwordUpdatedAt": 1651956862001,
    "providerUserInfo": [{
      "providerId": "password",
      "displayName": "User Name",
      "federatedId": "user@example.com",
      "email": "user@example.com",
      "rawId": "user@example.com"
    }],
    "validSince": "1651956862",
    "lastLoginAt": "1780724113414",
    "createdAt": "1651956862001",
    "customAuth": true
  }]
}
```

### Provider Discovery

```
POST https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key={API_KEY}
```

**Request Body:**
```json
{
  "identifier": "user@example.com",
  "continueUri": "https://cloud.thermoworks.com/"
}
```

**Response (200 OK):**
```json
{
  "allProviders": ["password"],
  "registered": true,
  "sessionId": "<session-id>",
  "signinMethods": ["password"]
}
```

---

## Firestore REST API

All Firestore operations use the base URL:

```
https://firestore.googleapis.com/v1/projects/thermoworks-cloud-production/databases/(default)/{operation}?key={API_KEY}
```

**Required Headers:**
| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <idToken>` |
| `Content-Type` | `application/json` (for POST/PATCH) |

### Operations

| Operation | Method | Path |
|-----------|--------|------|
| Get Document | GET | `documents/{collectionId}/{docId}` |
| List Documents | GET | `documents/{collectionPath}?pageSize={n}` |
| Run Query | POST | `documents:runQuery` |
| List Collection IDs | POST | `documents/{docPath}:listCollectionIds` |

### Structured Query Format

```json
{
  "structuredQuery": {
    "from": [{ "collectionId": "devices" }],
    "where": {
      "fieldFilter": {
        "field": { "fieldPath": "accountId" },
        "op": "EQUAL",
        "value": { "stringValue": "account-id-here" }
      }
    },
    "orderBy": [{ "field": { "fieldPath": "__name__" }, "direction": "ASCENDING" }],
    "limit": 100
  }
}
```

**Where operators:** `EQUAL`, `NOT_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `ARRAY_CONTAINS`, `IN`, `ARRAY_CONTAINS_ANY`, `NOT_IN`

### Firestore Value Types

All Firestore field values are typed wrappers:

```typescript
type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }      // Note: encoded as string
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }    // ISO 8601 format
  | { nullValue: null }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | { arrayValue: { values: FirestoreValue[] } };
```

---

## Collections

### users

User profile and preferences. Document ID = Firebase Auth UID.

**Path:** `documents/users/{userId}`

**Access:** Read/write own document only.

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `uid` | string | Firebase Auth UID |
| `email` | string | Email address |
| `displayName` | string | Display name |
| `photoURL` | string | Profile photo URL (empty string if none) |
| `accountId` | string | Associated account ID |
| `provider` | string | Auth provider (`"firebase"`) |
| `preferredUnits` | string | Temperature units: `"F"` or `"C"` |
| `timeZone` | string | IANA timezone (e.g., `"America/Los_Angeles"`) |
| `locale` | string | Locale code (e.g., `"en-US"`) |
| `use24Time` | boolean | 24-hour time preference |
| `lastLogin` | timestamp | Last authentication timestamp |
| `lastSeenInApp` | timestamp \| null | Last time user opened the app |
| `appVersion` | string | Last used app version (e.g., `"1.100.8"`) |
| `exportVersion` | double | Data export format version (e.g., `0.6`) |
| `accountRoles` | map | `{ accountAdmin: boolean }` |
| `roles` | map | `{ DataReader: boolean }` |
| `notificationSettings` | map | See [NotificationSettings](#notificationsettings) |
| `deviceOrder` | map | See [DeviceOrder](#deviceorder) |
| `deviceGroupOrDeviceOrder` | map | See [DeviceGroupOrder](#devicegrouporder) |
| `fcmTokens` | map | Firebase Cloud Messaging tokens: `{ tokenString: true }` |
| `system` | map | UI state: `{ hasPromptedEmailList: boolean }` |
| `hasSeenRfxRssiEducation` | boolean | UI onboarding state |
| `rfxRssiEducationSeenAt` | timestamp | When RSSI education was shown |

#### NotificationSettings

```json
{
  "enabled": true,
  "continuousAlerts": false,
  "emailNotification": false,
  "smsNotification": false,
  "deviceNotification": true
}
```

#### DeviceOrder

Map of `accountId` → array of ordered device entries:

```json
{
  "accountId123": [
    { "order": 0, "deviceId": "10:52:1c:5c:1d:da" },
    { "order": 1, "deviceId": "M100009168" }
  ]
}
```

#### DeviceGroupOrder

Map of `accountId` → indexed map of items:

```json
{
  "accountId123": {
    "0": { "id": "groupId1", "type": "deviceGroup" },
    "1": { "id": "M100009168", "type": "device" },
    "2": { "id": "M100070284", "type": "device" }
  }
}
```

---

### devices

IoT temperature monitoring devices. Document ID = device serial number.

**Path:** `documents/devices/{serial}`

**Access:** Query by `accountId` field (returns only devices belonging to your account).

**Query Example:**
```json
{
  "structuredQuery": {
    "from": [{ "collectionId": "devices" }],
    "where": {
      "fieldFilter": {
        "field": { "fieldPath": "accountId" },
        "op": "EQUAL",
        "value": { "stringValue": "your-account-id" }
      }
    }
  }
}
```

#### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serial` | string | ✅ | Device serial number (MAC or M-series) |
| `deviceId` | string | | Device identifier (often same as serial) |
| `accountId` | string | ✅ | Owning account ID |
| `type` | string | ✅ | Device type (see [DeviceType](#devicetype)) |
| `device` | string | | Device description (e.g., `"rfx gateway"`, `"rfx meat"`) |
| `label` | string | | User-assigned label |
| `status` | string | | Device status (see [DeviceStatus](#devicestatus)) |
| `firmware` | string | | Firmware version string |
| `battery` | integer | | Battery percentage (0-100) |
| `batteryState` | string | | `"charging"`, `"discharging"`, `"full"` |
| `batteryAlertSent` | boolean | | Whether low battery alert was fired |
| `wifi_stength` | integer | | WiFi RSSI in dBm (note: typo in field name) |
| `deviceDisplayUnits` | string | | Units shown on physical device (`"F"` or `"C"`) |
| `iotDeviceId` | string | | IoT Core device ID (e.g., `"TFCE8C0F27358"`) |
| `iotCoreDeviceBlocked` | boolean | | Whether IoT Core has blocked this device |
| **Timestamps** | | | |
| `lastSeen` | timestamp | | Last communication from device |
| `lastTelemetrySaved` | timestamp | | Last time telemetry was persisted |
| `lastWifiConnection` | timestamp | | Last WiFi connection |
| `lastBluetoothConnection` | timestamp | | Last Bluetooth connection |
| `sessionStart` | timestamp | | Current session start time |
| `latestReading` | timestamp | | Most recent temperature reading |
| `assignedToAccountOn` | timestamp | | When device was added to account |
| `lastPurged` | timestamp | | When historical data was purged |
| `lastArchive` | timestamp | | When last archive was created |
| **Configuration** | | | |
| `transmitIntervalInSeconds` | integer | | How often device transmits (seconds) |
| `recordingIntervalInSeconds` | integer | | How often device records (seconds) |
| `readInterval` | integer | | Temperature read interval (seconds) |
| `heartbeatInterval` | integer | | Device heartbeat interval (seconds) |
| `temperatureDeltaTrigger` | integer | | Minimum °change to trigger recording |
| `pendingLoad` | boolean | | Whether a config update is pending |
| **Session** | | | |
| `sessionLabel` | string | | Name of current cooking session |
| `notes` | string | | User notes for the device |
| **Sharing** | | | |
| `public` | boolean | | Whether device is publicly visible |
| `publicLink` | string | | URL for public access (empty if not shared) |
| **Gateway (RFX devices)** | | | |
| `gatewayId` | string | | Connected gateway's IoT device ID |
| `gatewayRSSI` | integer | | Signal strength to gateway (dBm) |
| `gatewayLastSeen` | timestamp | | Last gateway communication |
| `gatewaySwitchLastAt` | timestamp | | When gateway was last switched |
| `lastPacketId` | integer | | Last RF packet sequence number |
| **Fan Controller** | | | |
| `fan` | map | | See [FanSettings](#fansettings) |
| **Display** | | | |
| `color` | string | | Device color |
| `thumbnail` | string | | Thumbnail image URL |
| `ringColors` | array\<string\> | | Probe ring colors (e.g., `["red"]`) |
| `showSensorChannels` | boolean | | Whether to show sensor channels in UI |
| `searModeEnabled` | boolean | | Sear mode cooking feature |
| **Data Management** | | | |
| `exportVersion` | double | | Export format version |
| `bigQuery` | map | | See [BigQueryRef](#bigqueryref) |

#### FanSettings

BBQ blower/fan controller integration:

```json
{
  "connection": false,
  "connected": false,
  "setTemp": 275,
  "fan_channel": "1",
  "state": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `connection` | boolean | Whether fan hardware is connected |
| `connected` | boolean | Whether fan is communicating |
| `setTemp` | integer | Target pit temperature |
| `fan_channel` | string | Which temperature channel drives the fan |
| `state` | integer | Fan state (0=off) |

#### BigQueryRef

Reference to historical data stored in BigQuery:

```json
{
  "datasetId": "fQ3YD6XDIwJwDDzCjJQX",
  "tableId": "FC_E8_C0_F2_73_58"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `datasetId` | string | BigQuery dataset ID (= account ID) |
| `tableId` | string | BigQuery table ID (serial with `:` → `_`) |

---

### devices/{serial}/channels

Real-time temperature/humidity channel readings. Document ID = channel number (1-indexed).

**Path:** `documents/devices/{serial}/channels/{channelNumber}`

**Access:** Read access for devices in your account.

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `number` | string | Channel number (e.g., `"1"`) |
| `label` | string | User-assigned channel label (e.g., `"Ambient"`) |
| `value` | double | Current reading value |
| `units` | string | Reading units: `"F"`, `"C"`, or `"H"` (humidity) |
| `type` | string | Probe type (e.g., `"Pro-Series"`) |
| `status` | string | Channel status (see [ChannelStatus](#channelstatus)) |
| `enabled` | boolean | Whether channel is active |
| `color` | string | Display color (e.g., `"none"`, `"red"`) |
| `showAvgTemp` | boolean | Whether to show average temperature |
| `lastSeen` | timestamp | Last reading timestamp |
| `lastTelemetrySaved` | timestamp | Last persisted reading timestamp |
| `lastEventId` | string | Reference to latest event document |
| `estimatedAlarmStatus` | string | Computed alarm estimate (see [EstimatedAlarmStatus](#estimatedalarmstatus)) |
| `rateOfChange` | double | Temperature rate of change |
| `rateOfChangeUnit` | string | Unit for rate of change |
| `alarmHigh` | map | See [AlarmConfig](#alarmconfig) |
| `alarmLow` | map | See [AlarmConfig](#alarmconfig) |
| `minimum` | map | See [MinMaxReading](#minmaxreading) |
| `maximum` | map | See [MinMaxReading](#minmaxreading) |

#### AlarmConfig

```json
{
  "enabled": true,
  "alarming": false,
  "muted": false,
  "value": 275,
  "units": "F",
  "lastNotified": "2026-06-03T15:31:41.717Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Whether alarm is active |
| `alarming` | boolean | Whether alarm is currently triggered |
| `muted` | boolean | Whether alarm notifications are muted |
| `value` | integer | Alarm threshold value |
| `units` | string | Threshold units |
| `lastNotified` | timestamp | When last alarm notification was sent |

#### MinMaxReading

```json
{
  "reading": {
    "value": 331.7,
    "units": "F"
  },
  "dateReading": "2026-06-04T03:58:55.103Z"
}
```

---

### devices/{serial}/archive

Historical session archives containing temperature reading snapshots.

**Path:** `documents/devices/{serial}/archive/{archiveId}`

**Access:** Read access for devices in your account.

**List Example:**
```
GET documents/devices/{serial}/archive?pageSize=10&orderBy=end desc
```

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `start` | timestamp | Session start time |
| `end` | timestamp | Session end time |
| `count` | integer | Total number of readings in archive |
| `type` | string | `"auto"` (auto-archived) or `"manual"` |
| `label` | string | Session name (e.g., `"2 Briskets"`, `"Proof"`) |
| `deviceLabel` | string | Device label at time of archive |
| `notes` | string | User notes |
| `createdOn` | timestamp | When archive was created |
| `filename` | string | Export filename |
| `public` | boolean | Whether archive is publicly shared |
| `publicLink` | string | Public sharing URL |
| `events` | unknown | Events that occurred during session |
| `deviceData` | map | See [ArchiveDeviceData](#archivedevicedata) |
| `channels` | array | See [ArchiveChannel](#archivechannel) |

#### ArchiveDeviceData

Snapshot of device state at archive time:

```json
{
  "serial": "M100009168",
  "type": "rfx",
  "readInterval": 8,
  "lastSeen": "2026-06-21T14:22:30.589Z",
  "gatewayLastSeen": "2026-06-21T14:22:30.534Z",
  "lastBluetoothConnection": "..."
}
```

#### ArchiveChannel

```json
{
  "number": "1",
  "label": "Ambient",
  "units": "F",
  "value": 188.8,
  "status": "LOW",
  "enabled": true,
  "color": "none",
  "type": "Pro-Series",
  "alarmHigh": { "enabled": true, "alarming": false, "muted": false, "value": 275, "units": "F" },
  "alarmLow": { "enabled": true, "alarming": true, "muted": false, "value": 150, "units": "F" },
  "minimum": { "reading": { "value": 74.1, "units": "F" }, "dateReading": "..." },
  "maximum": { "reading": { "value": 331.7, "units": "F" }, "dateReading": "..." },
  "estimatedAlarmStatus": "More than 24 Hours",
  "rateOfChange": 0.0,
  "rateOfChangeUnit": "...",
  "lastSeen": "2026-06-04T14:08:07.383Z",
  "lastTelemetrySaved": "2026-06-04T14:08:07.105Z",
  "recentReadings": [
    { "v": "67.000", "ts": "2026-06-04T14:09:50.468Z", "u": "F" },
    { "v": "67.000", "ts": "2026-06-04T14:06:52.375Z", "u": "F" }
  ]
}
```

#### RecentReading

Individual temperature reading stored in archive:

| Field | Type | Description |
|-------|------|-------------|
| `v` | string | Value as decimal string (e.g., `"67.000"`) |
| `ts` | timestamp | Reading timestamp (ISO 8601) |
| `u` | string | Units (`"F"` or `"C"`) |

> **Note:** The `recentReadings` array in the archive document contains only the ~10 most
> recent readings per channel. Full historical time-series data is stored in BigQuery
> (see [BigQueryRef](#bigqueryref)). Access to the full history requires the
> `requestRetrieveInstrumentHistory` callable function.

---

### devices/{serial}/calibration

Factory calibration certificates with NIST-traceable reference data.

**Path:** `documents/devices/{serial}/calibration/{calibrationId}`

**Access:** Read access for devices in your account.

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `calibrationId` | string | UUID for this calibration record |
| `calibrationDate` | timestamp | When calibration was performed |
| `deviceId` | string | Device serial number |
| `sessionId` | string | UUID for the calibration session |
| `performedBy` | string | Technician name |
| `manager` | string | Supervising manager name |
| `referenceDetail` | string | Reference instrument ID (e.g., `"AP28R-30-A12E"`) |
| `statedAccuracy` | string | Accuracy specification (e.g., `"±0.9°F (0.5°C)"`) |
| `ambientTemperature` | string | Lab ambient temp (e.g., `"28.3°C ± 2.0 °C"`) |
| `ambientHumidity` | string | Lab humidity (e.g., `"54 %RH"`) |
| `result` | string | `"Pass"` or `"Fail"` |
| `lowPointAdjustments` | array | See [CalibrationPoint](#calibrationpoint) |
| `highPointReference` | array | See [CalibrationPoint](#calibrationpoint) |

#### CalibrationPoint

```json
{
  "channel": 1,
  "value": 32.0,
  "units": "F",
  "referenceValue": 32,
  "deviation": 0.0,
  "trimValue": -0.3,
  "result": "Pass"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `channel` | integer | Channel number (1-4) |
| `value` | double | Measured value |
| `units` | string | Measurement units |
| `referenceValue` | integer | Reference standard value |
| `deviation` | double | Difference from reference |
| `trimValue` | double | Applied trim/offset adjustment (low-point only) |
| `result` | string | `"Pass"` or `"Fail"` |

---

### events

Device event log tracking alarms, status changes, and alerts.

**Path:** `documents/events/{eventId}`

**Access:** Query by `accountId` field.

**Query Example:**
```json
{
  "structuredQuery": {
    "from": [{ "collectionId": "events" }],
    "where": {
      "fieldFilter": {
        "field": { "fieldPath": "accountId" },
        "op": "EQUAL",
        "value": { "stringValue": "your-account-id" }
      }
    },
    "orderBy": [{ "field": { "fieldPath": "EventTime" }, "direction": "DESCENDING" }],
    "limit": 50
  }
}
```

#### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `EventType` | string | ✅ | Event type (see [EventType](#eventtype)) |
| `Severity` | integer | ✅ | Severity level (see [EventSeverity](#eventseverity)) |
| `EventTime` | timestamp | ✅ | When event occurred |
| `deviceId` | string | ✅ | Device serial number |
| `accountId` | string | ✅ | Account ID |
| `channelId` | string | | Channel number (for channel-specific events) |
| `ValueBefore` | string | | Previous state/value (empty string if N/A) |
| `ValueAfter` | string | | New state/value (empty string if N/A) |
| `groups` | array\<string\> | | Device group IDs this device belongs to |

---

### firmware

Latest firmware versions available for each device type.

**Path:** `documents/firmware/{deviceType}`

**Access:** Read access (no auth scoping — all users can read).

**Known document IDs:** `signals`

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Firmware filename (e.g., `"TMW022_GOOGLE_V2.92"`) |
| `version` | string | Version string (e.g., `"2.92"`) |
| `location` | string | Firebase Storage download URL |
| `md5` | string | MD5 checksum for verification |

**Example `location` URL:**
```
https://firebasestorage.googleapis.com/v0/b/smoke-cloud.appspot.com/o/firmware%2FSignals%2FTMW022_GOOGLE_V2.92.bin?alt=media&token=<token>
```

---

### accounts

Account metadata. Document ID = account ID.

**Path:** `documents/accounts/{accountId}`

**Access:** Read own account only.

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Account display name (e.g., `"My Account"`) |
| `type` | string | `"personal"` or `"business"` |
| `createdOn` | timestamp | Account creation date |
| `exportVersion` | double | Data export format version |
| `settings` | map | See [AccountSettings](#accountsettings) |

#### AccountSettings

```json
{
  "contentSliderEnabled": false
}
```

#### Subcollections

| Subcollection | Description |
|---------------|-------------|
| `accounts/{id}/locations` | Location-based device grouping |
| `accounts/{id}/notificationschedules` | Notification schedule rules |

---

### content

Static content served by the app.

#### content/temperatureGuide

Cooking temperature reference guide.

**Path:** `documents/content/temperatureGuide`

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `guide` | array | Array of category entries |

Each category entry:

```json
{
  "label": "Beef",
  "icon": "beef",
  "pullWarning": "Temperatures listed are serve temperatures...",
  "warning": "Changes in color and texture are NOT reliable indicators...",
  "temperatures": [...]
}
```

**Categories:** Beef, Pork, Poultry, Fish, Lamb, Game

#### content/deviceDownloads/documents

Device documentation and PDF guides.

**Path:** `documents/content/deviceDownloads/documents/{docId}`

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `device` | string | Device type (e.g., `"bluedot"`) |
| `label` | string | Document title (e.g., `"BlueDOT Info Sheet"`) |
| `url` | string | Download URL (PDF) |

---

### system/billingPlans

Subscription tier definitions.

**Path:** `documents/system/billingPlans/plans/{planId}`

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Plan identifier |
| `description` | string | Plan name (e.g., `"ThermoWorks Basic"`) |
| `label` | string | Display label |
| `tagLine` | string | Marketing tagline |
| `status` | string | `"active"` |
| `order` | integer | Display order |
| `monthlyAmount` | number | Monthly cost |
| `billingPeriod` | string | Billing period |
| `customerType` | string | Target customer type |
| `deviceCount` | integer/map | Max devices allowed |
| `users` | map | User limits |
| `locations` | map | `{ enabled: bool, unlimited: bool, count: int }` |
| `notifications` | map | `{ sms: bool, email: bool, push: bool }` |
| `integration` | map | Integration capabilities |
| `dataLoggerSettings` | map | Data logging configuration |
| `allowAdditionalDevices` | boolean | Whether extra devices can be purchased |
| `additionalDevicePrice` | number | Per-device price |
| `additionalDeviceStripeId` | string | Stripe price ID |
| `stripeId` | string | Stripe plan ID |
| `default` | boolean | Whether this is the default free plan |
| `availablePlans` | array | Plans available for upgrade |
| `checklist` | array | Feature checklist for comparison |
| `devicePricing` | map | Tiered device pricing |

**Known Plans:**
- ThermoWorks Basic (free, default)
- ThermoWorks Home Plan
- Professional ThermoWorks Cloud
- Business Professional Plan
- Business Professional Plus
- Enterprise Professional
- Beta Consumer Grandfather (legacy)
- Business Pro Annual Invoice

---

### releases

App release notes / changelog.

**Path:** `documents/releases/{releaseId}`

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Version string (e.g., `"v.20.08"`) |
| `releaseDate` | timestamp | Release date |
| `improvements` | array\<string\> | List of improvements |
| `fixes` | array\<string\> | List of bug fixes (optional) |

---

### usersInvites

Multi-user account invitations.

**Path:** `documents/usersInvites/{inviteId}`

**Access:** Query by `accountId` field.

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `accountId` | string | Account that sent the invite |
| _(other fields TBD)_ | | |

---

## Callable Cloud Functions

Callable functions are invoked via HTTP POST to:

```
https://us-central1-thermoworks-cloud-production.cloudfunctions.net/{functionName}
```

**Headers:**
| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <idToken>` |
| `Content-Type` | `application/json` |

**Request format:**
```json
{
  "data": { /* function-specific parameters */ }
}
```

**Response format:**
```json
{
  "result": { /* function-specific response */ }
}
```

### Account & Billing

| Function | Description | Parameters |
|----------|-------------|------------|
| `createPortalLink` | Create Stripe billing portal URL | `{ accountId }` |
| `accountAddDevice` | Add device to account | `{ accountId, deviceId }` |
| `accountUpdateSubscriptionPlan` | Change subscription | `{ accountId, planId }` |
| `accountingSubscriptionResume` | Resume paused subscription | `{ accountId }` |
| `accountingSubscriptionUpcomingInvoice` | Get next invoice preview | `{ accountId }` |
| `accountingPriceDetail` | Get pricing details | `{ planId }` |
| `accountInvoices` | List past invoices | `{ accountId }` |
| `accountCancelPlan` | Cancel subscription | `{ accountId }` |
| `accountPurge` | Purge all account data | `{ accountId }` |
| `accountGetAvailablePlansByCurrentPlanId` | Get upgrade options | `{ planId }` |
| `accountChangePlan` | Change to different plan | `{ accountId, planId }` |
| `accountDataStorageSize` | Get total data usage | `{ accountId }` |
| `accountDataStorageSizeByTable` | Get per-device data usage | `{ accountId }` |

### Device Management

| Function | Description | Parameters |
|----------|-------------|------------|
| `deviceInitProvisioning` | Initialize new device provisioning | `{ deviceId }` |
| `deviceGenerateConfig` | Generate device configuration | `{ deviceId }` |
| `deviceFactoryReset` | Factory reset device | `{ deviceId }` |
| `deviceStateUpdate` | Update device state/settings | `{ deviceId, state }` |
| `deviceClearEvents` | Clear all events for device | `{ deviceId }` |
| `telemetryDeviceChannelResetMinMax` | Reset min/max readings | `{ deviceId, channelId }` |

### Session Management

| Function | Description | Parameters |
|----------|-------------|------------|
| `newSessionRequest` | Start a new cooking session | `{ deviceId, label? }` |
| `endSessionRequest` | End current session | `{ deviceId }` |
| `clearSessionRequest` | Clear session without archiving | `{ deviceId }` |

### Sharing

| Function | Description | Parameters |
|----------|-------------|------------|
| `publicShareArchive` | Create public share of archive | `{ archiveId, deviceId }` |
| `publicShareDeviceState` | Share live device state publicly | `{ deviceId }` |

### Instrument Access (BLE/Direct)

| Function | Description | Parameters |
|----------|-------------|------------|
| `GetMyConnections` | List connected instruments | `{}` |
| `removeAccessToInstrument` | Remove access to instrument | `{ deviceId }` |
| `removeAllOtherConnectionsWithAccess` | Exclusive access mode | `{ deviceId }` |
| `setInstrumentName` | Rename instrument | `{ deviceId, name }` |
| `setInstrumentSettings` | Update instrument settings | `{ deviceId, settings }` |
| `requestRetrieveInstrumentHistory` | Get historical data | `{ deviceId }` |
| `requestCacheDeviceInfo` | Cache device info | `{ deviceId }` |
| `requestFullDeviceInfo` | Get full device info | `{ deviceId }` |
| `requestReadAccessToInstrument` | Request read access | `{ deviceId }` |
| `requestWriteAccessToInstrument` | Request write access | `{ deviceId }` |

### User Management

| Function | Description | Parameters |
|----------|-------------|------------|
| `userRemoteFromAccount` | Remove user from account | `{ userId, accountId }` |
| `getTokenToImpersonateUser` | Impersonate user (admin) | `{ userId }` |

---

## Search API (Typesense)

Full-text search powered by Typesense, accessed via callable function.

**Function:** `typesense_search`

**Request:**
```json
{
  "data": {
    "query": "search terms",
    "collection": "device",
    "page": 1,
    "pageSize": 10
  }
}
```

**Valid collections:** `device`, `accounts`, `users`

**Response:** Typesense search results with hits, facets, and pagination.

---

## Firebase Configuration

### Web Config

```
GET https://firebase.googleapis.com/v1alpha/projects/-/apps/{APP_ID}/webConfig
Headers: x-goog-api-key: {API_KEY}, Referer: https://cloud.thermoworks.com/
```

**Response:**
```json
{
  "projectId": "thermoworks-cloud-production",
  "appId": "1:78998049458:web:b41e9d405d8c7de95eefab",
  "databaseURL": "https://thermoworks-cloud-production.firebaseio.com",
  "storageBucket": "thermoworks-cloud-production.appspot.com",
  "locationId": "us-central",
  "authDomain": "thermoworks-cloud-production.firebaseapp.com",
  "messagingSenderId": "78998049458",
  "measurementId": "G-QR97NH3XW1"
}
```

### Firebase Hosting Init

```
GET https://cloud.thermoworks.com/__/firebase/init.json
```

Returns the public Firebase config (no auth required).

---

## Data Types & Enums

### DeviceType

| Value | Description |
|-------|-------------|
| `"rfx"` | RFX Gateway or RFX wireless device |
| `"signals"` | ThermoWorks Signals multi-channel |
| `"smoke"` | ThermoWorks Smoke |
| `"node"` | ThermoWorks Node |
| `"bluedot"` | ThermoWorks BlueDOT |

### DeviceStatus

| Value | Description |
|-------|-------------|
| `"NORMAL"` | Operating normally |
| `"LOW"` | Low reading / below threshold |
| `"HIGH"` | High reading / above threshold |
| `"NO PROBE"` | No probe connected |
| `"OFFLINE"` | Device not communicating |

### ChannelStatus

| Value | Description |
|-------|-------------|
| `"NORMAL"` | Reading within alarm thresholds |
| `"LOW"` | Below low alarm threshold |
| `"HIGH"` | Above high alarm threshold |
| `"NO PROBE"` | No probe detected on this channel |

### EventType

| Value | Severity | Description |
|-------|----------|-------------|
| `"Low Battery Alert"` | 4 | Battery critically low |
| `"Status Changed"` | 2 | Channel status transition |
| `"Low Alarm Alert"` | 4 | Temperature fell below low alarm |
| `"Low Alarm Resolved"` | 3 | Temperature returned above low alarm |
| `"High Alarm Alert"` | 4 | Temperature exceeded high alarm |
| `"High Alarm Resolved"` | 3 | Temperature returned below high alarm |
| `"Alarm Low Change"` | 0 | Low alarm threshold was modified |
| `"Alarm High Change"` | 0 | High alarm threshold was modified |

### EventSeverity

| Value | Level | Description |
|-------|-------|-------------|
| `0` | Info | Configuration changes |
| `2` | Warning | Status transitions |
| `3` | Notice | Alarm resolution |
| `4` | Critical | Active alarms and alerts |

### EstimatedAlarmStatus

Computed time-to-alarm strings displayed in the UI:

| Value | Meaning |
|-------|---------|
| `"More than 24 Hours"` | Alarm threshold far from current reading |
| `"Alarm needs to be set to calculate estimated time"` | No alarm configured |
| `"X minutes"` | Estimated time until alarm triggers |

### TemperatureUnits

| Value | Description |
|-------|-------------|
| `"F"` | Fahrenheit |
| `"C"` | Celsius |
| `"H"` | Relative humidity (%) |

---

## Error Handling

### Firestore Errors

```json
{
  "error": {
    "code": 403,
    "message": "Missing or insufficient permissions.",
    "status": "PERMISSION_DENIED"
  }
}
```

| HTTP Code | Status | Meaning |
|-----------|--------|---------|
| 400 | `INVALID_ARGUMENT` | Malformed query or invalid field |
| 403 | `PERMISSION_DENIED` | Firestore security rules deny access |
| 404 | `NOT_FOUND` | Document does not exist |
| 429 | `RESOURCE_EXHAUSTED` | Rate limit exceeded |
| 503 | `UNAVAILABLE` | Service temporarily unavailable |

### Auth Errors

| HTTP Code | Error Message | Meaning |
|-----------|---------------|---------|
| 400 | `EMAIL_NOT_FOUND` | No account with this email |
| 400 | `INVALID_PASSWORD` | Wrong password |
| 400 | `USER_DISABLED` | Account is disabled |
| 400 | `TOO_MANY_ATTEMPTS_TRY_LATER` | Brute-force protection triggered |
| 400 | `TOKEN_EXPIRED` | ID token has expired (refresh needed) |

### Callable Function Errors

```json
{
  "error": {
    "message": "INTERNAL",
    "status": "INTERNAL"
  }
}
```

| Status | Meaning |
|--------|---------|
| `INTERNAL` | Server-side error (often wrong parameters) |
| `UNAUTHENTICATED` | Missing or invalid auth token |
| `PERMISSION_DENIED` | Insufficient access rights |
| `NOT_FOUND` | Resource not found |
| `INVALID_ARGUMENT` | Bad request parameters |

---

## Rate Limits & Quotas

### Firebase Auth
- Sign-in: ~100 requests/IP/hour (configurable by project)
- Token refresh: No hard limit, but tokens last 3600s

### Firestore
- Document reads: Subject to Firebase Spark/Blaze plan limits
- Queries: Max 1000 results per page (use pagination)
- Document size: Max 1 MiB per document

### Callable Functions
- Subject to Cloud Functions quotas (varies by plan)
- Concurrent invocations limited per function

### Recommended Client Behavior
- Cache auth tokens for their full lifetime (3600s) minus 60s buffer
- Use `pageSize` parameters to limit query results
- Implement exponential backoff on 429/503 errors
- Batch reads where possible using structured queries

---

## Access Control Summary

| Collection/Path | Read Access | Write Access |
|-----------------|-------------|--------------|
| `users/{uid}` | Own doc only | Own doc only |
| `devices` (query) | By accountId match | Limited (use callable functions) |
| `devices/{serial}` | Own account devices | Limited |
| `devices/{serial}/channels` | Own account devices | No direct write |
| `devices/{serial}/archive` | Own account devices | No direct write |
| `devices/{serial}/calibration` | Own account devices | No direct write |
| `devices/{serial}/history` | ❌ Permission denied | ❌ |
| `devices/{serial}/sessions` | ❌ Permission denied | ❌ |
| `devices/{serial}/links` | ❌ Permission denied | ❌ |
| `events` (query) | By accountId match | No direct write |
| `firmware` | All authenticated users | No |
| `accounts/{id}` | Own account only | Limited |
| `content/*` | All authenticated users | No |
| `system/billingPlans/*` | All authenticated users | No |
| `releases` | All authenticated users | No |
| Root `listCollectionIds` | ❌ Permission denied | — |
| Device `listCollectionIds` | ❌ Permission denied | — |
