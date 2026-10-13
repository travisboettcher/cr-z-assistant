/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * The commit the bundle was built from, set by the Dockerfile's `APP_VERSION`
   * build argument. Absent, or empty, in development and in any build that did
   * not pass one.
   */
  readonly VITE_APP_VERSION?: string;
}
