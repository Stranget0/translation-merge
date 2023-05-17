require("dotenv").config();

const commonLinuxConfig = {
  mimeType: ["x-scheme-handler/electron-fiddle"],
};

module.exports = {
  packagerConfig: {},
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {},
      platforms: ["win32"],
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-deb",
      platforms: ["linux"],
      config: commonLinuxConfig,
    },
    {
      name: "@electron-forge/maker-rpm",
      platforms: ["linux"],
      config: commonLinuxConfig,
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "Stranget0",
          name: "translation-merge",
        },
        prerelease: false,
        draft: true,
        authToken: process.env.GITHUB_TOKEN,
      },
    },
  ],
};
