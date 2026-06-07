---
"thermoworks-sdk": minor
---

Add shared alarm utilities (getChannelAlarmState, getChannelsAlarmState, escalateAlarm), shared config types and validation (StatuslineConfig, DeviceEntry, isValidDeviceEntry), shared credential contract (parseCredentialBlob, serializeCredentials, resolveEnvCredentials), formatTimeAgo utility, retry with exponential backoff for transient HTTP failures, parallel channel fetches via Promise.allSettled, 9 new API methods (getAccount, getEvents, getArchives, getArchive, getCalibration, getFirmwareInfo, getTemperatureGuide, search, getDeviceEvents), and hardened isValidDeviceEntry to reject empty channels.
