const admin = require('firebase-admin');

let serviceAccount;
if (process.env.FIREBASE_CONFIG) {
  serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_CONFIG, 'base64').toString('ascii'));
} else {
  serviceAccount = require('./gooto-app-firebase-adminsdk-7umvg-a9130b33d2.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

exports.sendPushNotification = async (token, title, body, data = {}) => {
  const stringifiedData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value)])
  );

  const message = {
      notification: {
          title,
          body
      },
      data: stringifiedData, 
      token
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
