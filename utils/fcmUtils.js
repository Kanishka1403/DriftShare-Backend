const admin = require('firebase-admin');

// let serviceAccount;
// if (process.env.FIREBASE_CONFIG) {
//   serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_CONFIG, 'base64').toString('ascii'));
// } else {
//   serviceAccount = require('./driftshare-85ffb-firebase-adminsdk-a46wu-2461d15ba7.json');
// }
var serviceAccount = require("./driftshare-85ffb-firebase-adminsdk-a46wu-2461d15ba7.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

exports.sendPushNotification = async (token, title, body, data = {}, sound) => {
  const stringifiedData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value)])
  );

  const message = {
      notification: {
          title,
          body,
      },
      data: stringifiedData,
      token,
      android: {
          notification: {
              sound: sound || "default"
          }
      },
      apns: {
        payload: {
            aps: {
                "content-available": 1,  
                "mutable-content": 1,   
                // sound: "loud_alarm_sound.mp3"
            }
        },
        headers: {
            "apns-priority": "10",
            "apns-push-type": "alert"
        }
    }
  };

  try {
      const response = await admin.messaging().send(message);
      console.log('Successfully sent message:', response);
      return response;
  } catch (error) {
      console.error('Error sending push notification:', error);
      throw error;
  }
};

