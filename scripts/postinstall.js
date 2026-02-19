const fs = require('fs');
const path = require('path');

const buildGradlePath = path.resolve(__dirname, '../node_modules/expo-camera/android/build.gradle');

if (fs.existsSync(buildGradlePath)) {
  let content = fs.readFileSync(buildGradlePath, 'utf8');

  const repositoriesBlock = `
allprojects {
    repositories {
        maven {
            url 'https://www.jitpack.io'
        }
    }
}
`;

  // Only add the block if it doesn't already exist
  if (!content.includes("https://www.jitpack.io")) {
    content += repositoriesBlock;
    fs.writeFileSync(buildGradlePath, content);
    console.log('✅ Patched expo-camera/android/build.gradle to include JitPack repository.');
  } else {
    console.log('✅ expo-camera/android/build.gradle already patched.');
  }
} else {
  console.warn('Could not find expo-camera/android/build.gradle to patch.');
}
