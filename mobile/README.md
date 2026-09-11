# mobile

Expo (managed workflow) app for the School Management System, used by Parent, Student and
Teacher roles. Built with Expo Router, TypeScript, NativeWind, TanStack Query and
expo-secure-store.

## Get started

```bash
npm install
cp .env.example .env
npx expo start
```

From the output you can open the app in a development build, Android emulator, iOS simulator,
or Expo Go.

## Structure

- `src/app` — Expo Router routes (file-based). `(auth)` and `(app)` are route groups.
- `src/components/providers` — app-wide providers (TanStack Query).
- `src/lib` — API client (axios) and secure token storage helpers.

## Learn more

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [NativeWind](https://www.nativewind.dev/)
