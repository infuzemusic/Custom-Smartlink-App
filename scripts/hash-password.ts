import { hashPassword } from '../src/lib/password.ts';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run admin:hash -- <password>');
  process.exit(1);
}
console.log('\nADMIN_PASSWORD_HASH=' + hashPassword(password) + '\n');
