# 🚨 FCM Error: "sdkCors=false" - तुरंत समाधान

## ⚠️ Important: यह पुराना cached code है!

आपका browser **पुरानी service worker और cached files** use कर रहा है। Latest code में fix है लेकिन browser ने अभी तक update नहीं किया।

---

## ✅ तुरंत Fix करें (3 Methods)

### Method 1: One-Click Automatic Fix (Recommended) ⭐
```
1. अपनी site पर जाएं: https://yourdomain.com/clear-cache.html
2. "Complete Reset करें" button click करें
3. Page automatically reload होगा
4. Notifications फिर से enable करें
```

यह automatic file आपके code में है (`public/clear-cache.html`)

---

### Method 2: Manual Browser Reset (Fast)
```
Chrome/Edge:
1. F12 दबाएं (Developer Tools खोलें)
2. Application tab → Storage (left sidebar)
3. "Clear site data" button click करें
4. ✅ सभी checkboxes selected रखें
5. "Clear site data" confirm करें
6. Hard Reload: Ctrl + Shift + R

Firefox:
1. F12 → Storage tab
2. Right click on domain → "Delete All"
3. Service Workers tab → Unregister
4. Hard Reload: Ctrl + Shift + R

Safari:
1. Develop menu → Empty Caches (Cmd + Option + E)
2. Safari → Preferences → Privacy → Manage Website Data
3. अपनी site select करें → Remove
4. Page reload करें
```

---

### Method 3: Console Commands (Advanced)
```javascript
// Browser Console (F12) में paste करें:

// Complete reset script
(async function() {
  console.log('🔄 Starting complete reset...');
  
  // 1. Unregister all service workers
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const reg of regs) {
    await reg.unregister();
    console.log('✅ Unregistered:', reg.scope);
  }
  
  // 2. Clear all caches
  const cacheNames = await caches.keys();
  for (const name of cacheNames) {
    await caches.delete(name);
    console.log('✅ Deleted cache:', name);
  }
  
  // 3. Delete Firebase databases
  await new Promise(r => {
    const req = indexedDB.deleteDatabase('firebaseLocalStorageDb');
    req.onsuccess = r;
    req.onerror = r;
  });
  console.log('✅ Deleted Firebase IndexedDB');
  
  // 4. Clear storage
  localStorage.clear();
  sessionStorage.clear();
  console.log('✅ Cleared storage');
  
  console.log('✅ Complete! Reloading in 2 seconds...');
  setTimeout(() => location.reload(), 2000);
})();
```

---

## 🔍 Verify Fix Successful

### Test करें Console में:
```javascript
// 1. Service worker check
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Active SWs:', regs.length);
  regs.forEach(r => console.log('  -', r.active?.scriptURL));
});
// Expected: 0 registrations (ya sirf firebase-messaging-sw.js)

// 2. Cache check
caches.keys().then(keys => {
  console.log('Caches:', keys.length === 0 ? 'All clear ✅' : keys);
});
// Expected: [] या ["workbox-..."] (Next.js default)

// 3. Firebase local data check
Object.keys(localStorage).filter(k => k.includes('firebase'))
// Expected: [] (empty array)
```

### Expected Success Output:
```
Active SWs: 0
Caches: All clear ✅
Firebase keys: []

अब page reload करें और notifications enable करें!
```

---

## 📊 Why This Happens?

### Problem Timeline:
```
1. पुराना code deploy था (CDN-based Firebase)
   ↓
2. Service Worker browser में cached हो गया
   ↓
3. नया code deploy किया (npm-based Firebase)
   ↓
4. Browser पुराना service worker use कर रहा है (cached)
   ↓
5. Error: sdkCors=false (पुरानी CDN script try कर रहा है)
```

### Why Browser Doesn't Auto-Update?
```
❌ Service worker automatically update नहीं होता (by design)
❌ 24 hours तक browser cache में रह सकता है
❌ User hard reload (Ctrl+R) भी काफी नहीं (SW अलग cache है)
✅ Explicit unregister + clear storage chahiye
```

---

## 🎯 After Reset: Latest Code Features

### New Implementation:
```typescript
// पहले (पुराना - cached):
importScripts('https://www.gstatic.com/.../firebase-app-compat.js')
// ❌ CDN dependency → CORS issues

// अब (नया - जो load होगा reset के बाद):
import { initializeApp, getMessaging } from 'firebase/app';
// ✅ Local bundle → No CORS issues
```

### Success Indicators:
```
✅ No "sdkCors=false" error
✅ Token generation < 2 seconds
✅ Error message: null
✅ Network probe: all true
✅ Console: No red errors
```

---

## 🚀 Production Deployment Fix

### For All Users (Automatic):
```javascript
// Add this to your app initialization (app/layout.tsx या main entry):

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // Force service worker update on page load
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
      // Check if it's our Firebase SW
      if (registration.active?.scriptURL.includes('firebase-messaging-sw.js')) {
        console.log('Checking for service worker updates...');
        registration.update().catch(err => {
          console.warn('SW update check failed:', err);
        });
      }
    });
  });
  
  // Listen for updates
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('Service worker updated! Reloading...');
    window.location.reload();
  });
}
```

यह code automatically सभी users के लिए service worker update कर देगा।

---

## ⚠️ Alternative: Version-based SW File

### Service Worker में version add करें:
```javascript
// public/firebase-messaging-sw.js में top पर:
const SW_VERSION = 'v2.0.0'; // हर deploy पर बदलें
console.log('Firebase SW loaded:', SW_VERSION);

// Version check करके automatically reload
self.addEventListener('message', (event) => {
  if (event.data.type === 'CHECK_VERSION') {
    event.ports[0].postMessage({ version: SW_VERSION });
  }
});
```

### Client-side version check:
```typescript
async function checkSWVersion() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.active) return;
  
  const messageChannel = new MessageChannel();
  reg.active.postMessage({ type: 'CHECK_VERSION' }, [messageChannel.port2]);
  
  const response = await new Promise(resolve => {
    messageChannel.port1.onmessage = (e) => resolve(e.data);
    setTimeout(() => resolve(null), 1000);
  });
  
  const expectedVersion = 'v2.0.0';
  if (response?.version !== expectedVersion) {
    console.warn('SW version mismatch, forcing update...');
    await reg.unregister();
    location.reload();
  }
}
```

---

## 📱 Mobile Browser Specific

### Android Chrome:
```
1. Settings → Site settings → yourdomain.com
2. "Clear & reset" button
3. Page reload करें
```

### iOS Safari:
```
1. Settings → Safari → Advanced
2. Website Data → yourdomain.com
3. Swipe left → Delete
4. Safari completely close करें (swipe up from multitasking)
5. Safari फिर से खोलें
```

---

## 🆘 Still Not Working?

### Debugging Checklist:
```
□ Browser console में कोई red error नहीं?
□ Network tab में firebase-messaging-sw.js status 200 है?
□ Application tab में service worker "activated" है?
□ Notification permission "granted" है?
□ HTTPS पर site है (not HTTP)?
□ Incognito mode में try किया?
```

### Last Resort:
```
1. Browser completely close करें (सभी tabs)
2. Browser restart करें
3. Site खोलें
4. F12 → Console → Complete reset script run करें
5. 30 seconds wait करें
6. Hard reload (Ctrl+Shift+R)
7. Notifications enable करें
```

---

## 📞 Technical Support Info

### Report Issue With:
```json
{
  "browser": "Chrome 120.0.0",
  "os": "Windows 11",
  "url": "https://pragnya.navasanganakah.com",
  "error": "getToken failed: sdkCors=false",
  "swRegistrations": 1,
  "cacheCount": 5,
  "firebaseKeys": ["firebase:host:...", "..."],
  "timestamp": "2026-09-14T10:30:00",
  "tried": [
    "✅ Method 1: clear-cache.html",
    "✅ Method 2: Manual reset",
    "❌ Still failing"
  ]
}
```

Copy यह output:
```javascript
// Console में run करें:
JSON.stringify({
  browser: navigator.userAgent,
  url: location.href,
  swRegs: (await navigator.serviceWorker.getRegistrations()).length,
  caches: (await caches.keys()).length,
  fbKeys: Object.keys(localStorage).filter(k => k.includes('firebase')),
  timestamp: new Date().toISOString()
}, null, 2);
```

---

## ✅ Success Metrics

### Before Fix:
```
❌ Token generation: Failed
❌ Error: sdkCors=false
❌ Service workers: 1 (stale)
❌ Caches: 10+ (old versions)
```

### After Fix:
```
✅ Token generation: Success (1-2 seconds)
✅ Error: null
✅ Service workers: 1 (fresh, latest version)
✅ Caches: 0-2 (clean)
✅ Console: No errors
```

---

## 🎉 Final Steps

1. ✅ Reset browser cache (Method 1, 2, or 3)
2. ✅ Verify clean state (Console checks)
3. ✅ Page reload करें
4. ✅ Notifications enable करें
5. ✅ Token verify करें (should be 70+ characters)
6. ✅ Test notification send करें

**Expected Result**: Notifications working perfectly! 🔔

