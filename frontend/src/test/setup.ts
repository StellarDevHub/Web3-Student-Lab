import "@testing-library/jest-dom";
import { configureAxe } from "jest-axe";

// Configure axe for all tests
configureAxe({
  rules: {
    // Relax color-contrast rule since we test structure not visual design
    "color-contrast": { enabled: false },
  },
});
