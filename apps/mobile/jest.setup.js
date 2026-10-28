/* global jest */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@react-native-community/netinfo", () => require("./src/test/netInfo"));
jest.mock("expo-file-system", () => require("./src/test/fileSystem"));
