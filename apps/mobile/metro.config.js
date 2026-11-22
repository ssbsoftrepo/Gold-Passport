// Expo's Metro config with Sentry's debug ids, so crash reports can be matched to source maps.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);
