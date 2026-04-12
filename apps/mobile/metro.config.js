const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const mobileNodeModules = path.resolve(__dirname, "node_modules");

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  react: path.join(mobileNodeModules, "react"),
  "react-native": path.join(mobileNodeModules, "react-native")
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react" || moduleName === "react/jsx-runtime" || moduleName === "react/jsx-dev-runtime") {
    return context.resolveRequest(context, path.join(mobileNodeModules, moduleName), platform);
  }

  if (moduleName === "react-native" || moduleName.startsWith("react-native/")) {
    return context.resolveRequest(context, path.join(mobileNodeModules, moduleName), platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
