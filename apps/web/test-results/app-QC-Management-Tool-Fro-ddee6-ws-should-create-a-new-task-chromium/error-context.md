# Page snapshot

```yaml
- generic [ref=e1]:
  - alert [ref=e2]: QC Manager - Login
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: QC
      - heading "Welcome back" [level=1] [ref=e7]
      - paragraph [ref=e8]: Sign in to QC Manager
    - generic [ref=e9]:
      - generic [ref=e10]:
        - generic [ref=e11]:
          - generic [ref=e12]: Email
          - textbox "you@company.com" [active] [ref=e13]
        - generic [ref=e14]:
          - generic [ref=e15]: Password
          - textbox "••••••••" [ref=e16]
        - button "Sign In" [ref=e17] [cursor=pointer]
      - paragraph [ref=e19]:
        - text: Don't have an account?
        - link "Create one" [ref=e20] [cursor=pointer]:
          - /url: /register
    - paragraph [ref=e21]: QC Management Tool © 2026
```