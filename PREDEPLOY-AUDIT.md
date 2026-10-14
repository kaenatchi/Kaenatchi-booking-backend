# Booking Core — pre-deployment audit

Status: **NOT DEPLOYED to Google Apps Script. Do not deploy from this branch yet.**

## Changes in this candidate
- Corrected the Jalali date/time parser's escaped digit patterns and added malformed-date/finite-timestamp self-tests.
- Removed the hard-coded 8-hour cancellation cutoff; customer cancellation remains a manager-reviewed request.
- Added request-ID idempotency to prevent retries with the same request ID from creating duplicate booking requests; conflicting reuse of an ID is rejected.
- VIP discounts remain deliberately fail-closed until Telegram initData verification, VIP ownership binding, and safe token finalization are implemented and tested.

## Blocking integration findings
1. The current Mini App still uses the legacy action contract: getAvailableSlots, validateDiscount, createBooking, submitPayment, bookingStatus. This Core currently exposes a different contract: getSlots, createRequest, submitReceipt, getStatus. The Mini App must be adapted in a separate, isolated branch before this Core can be connected.
2. The current Mini App flow collects a receipt during the initial booking submit. The required new flow is request first, manager accepts, then a 30-minute payment window; the UI flow must be redesigned to match.
3. VIP validation is not ready: this candidate refuses discounts without server-verified Telegram identity, and discounted payment approval remains blocked. Do not enable VIP by trusting a client-supplied Telegram ID.
4. CMS data is read from getMiniAppData, but service IDs currently fall back to row-index-based IDs when CMS rows lack explicit stable IDs. Stable service IDs must be agreed across CMS and Mini App.
5. Staging Script Properties and spreadsheet schema have not been audited from the actual Apps Script project. No Apps Script functions have been executed by this work.

## Safety
- No Google Apps Script deployment performed.
- No Worker, live Mini App, CMS, VIP spreadsheet, or production backend changed.
- No schema initializer executed.
