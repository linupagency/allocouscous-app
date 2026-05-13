const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Validation développeurs Android (Play Console) : l'APK doit contenir
 * assets/adi-registration.properties avec le jeton affiché sur la page d'import.
 *
 * 1) Variable EAS : GOOGLE_ADI_REGISTRATION_TOKEN (recommandé, ne pas committer)
 * 2) Ou fichier local : assets/adi-registration.properties (une ligne = le jeton)
 */
function withAndroidAdiRegistration(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      let token = (process.env.GOOGLE_ADI_REGISTRATION_TOKEN || '').trim();
      const fromFile = path.join(projectRoot, 'assets', 'adi-registration.properties');
      if (!token && fs.existsSync(fromFile)) {
        token = fs.readFileSync(fromFile, 'utf8').trim();
        const line = token.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith('#'));
        if (line) token = line.trim();
      }
      if (!token) {
        return modConfig;
      }
      const destDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets');
      const destFile = path.join(destDir, 'adi-registration.properties');
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(destFile, token, 'utf8');
      return modConfig;
    },
  ]);
}

module.exports = withAndroidAdiRegistration;
