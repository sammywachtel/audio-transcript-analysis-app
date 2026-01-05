# What's New

## Version 1.8.0-beta - January 5, 2026

### ✨ New Features

**Cost Transparency for Everyone**
- You can now see a **pricing accuracy indicator** on your My Stats page that shows whether your cost estimates are up-to-date with current rates
- The indicator displays when rates were last captured and includes a disclaimer about how costs are calculated
- Admins see a convenient link to dive deeper into the cost breakdown

**Admin Cost Dashboard**
- New Job Detail view shows timing breakdowns, token usage, and cost verification for each processing job
- Chat metrics tab shows query volumes and response times by conversation
- Cost Reconciliation report for monthly billing verification with CSV export

### 🔧 Improvements

**Cleaner Modals**
- Delete and abort confirmation dialogs no longer show potentially inaccurate cost estimates
- You'll be directed to My Stats for accurate cost information instead

**Better Billing Integration**
- All API calls now include billing labels for easier cost tracking in Google Cloud

### 🐛 Bug Fixes
- Fixed admin dashboard URL routing for job detail and reconciliation pages
- Fixed timezone issues in cost reconciliation date grouping
- Pricing accuracy now correctly shows "No pricing configured" when rates haven't been set up (previously showed a misleading "match" status)

---

*For technical details, see [CHANGELOG.md](./CHANGELOG.md)*
