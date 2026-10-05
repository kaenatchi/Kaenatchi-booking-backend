/************************************************************
 * کائنات‌چی | Google Apps Script
 * نسخه اصلاح‌شده Mini App + Booking + Telegram Approval
 *
 * ویژگی‌ها:
 * - ثبت واقعی نوبت در شیت
 * - کد پیگیری واقعی از سمت سرور
 * - جلوگیری از رزرو همزمان
 * - متن رسید بانکی اجباری
 * - تصویر فیش اختیاری
 * - ارسال درخواست به تلگرام ادمین
 * - دکمه تأیید / رد نوبت
 * - پیام تأیید / رد برای مشتری
 * - امکان بررسی وضعیت ثبت از Mini App
 * - Telegram Webhook برای دریافت دکمه‌های ادمین
 *
 * ستون‌های نوبت‌ها:
 * A زمان ثبت
 * B تاریخ
 * C ساعت
 * D نام
 * E موبایل
 * F خدمت
 * G کد پیگیری
 * H کلید نوبت
 * I وضعیت
 * J نام خانوادگی
 * K کد تخفیف
 * L مبلغ اصلی
 * M مبلغ تخفیف
 * N مبلغ نهایی
 * O شناسه تلگرام
 * P وضعیت پرداخت
 * Q وضعیت نوبت
 * R لینک فیش
 * S وضعیت مشاوره
 * T متن رسید بانکی
 * U شماره تراکنش
 * V شناسه درخواست
 * W زمان تأیید
 * X یادداشت ادمین
 ************************************************************/


/* =========================================================
   تنظیمات اصلی
========================================================= */

var SHEET_NAME = "نوبت‌ها";

var PROP_SHEET_ID = "BOOKING_SHEET_ID";
var PROP_BOT_TOKEN = "TELEGRAM_BOT_TOKEN";
var PROP_CHAT_ID = "TELEGRAM_CHAT_ID";
var PROP_RECEIPTS_FOLDER_ID = "RECEIPTS_FOLDER_ID";


/*
 * آدرس فعلی Web App
 *
 * مهم:
 * این همان آدرسی است که Mini App فعلی استفاده می‌کند.
 * آدرس جدید نساز.
 */
var TELEGRAM_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbyGSzpV9iHxMsVmceAI4i5KIhbsttuD5pOkDqRK58mx-QlP60CWjg2PZfU5miLgN2ssSw/exec";


/* =========================================================
   POST اصلی
========================================================= */

function doPost(e) {

  var lock = LockService.getScriptLock();
  var data = {};

  try {

    /*
     * ابتدا اطلاعات POST را می‌خوانیم.
     */
    data = receivePostData(e);


    /* عملیات مدیریتی پنل مرکزی */
    if (data && data.central_admin_action) {
      return handleCentralAdminAction(data);
    }


    /*
     * اگر درخواست از Telegram Webhook آمده باشد،
     * مستقیماً به پردازش Telegram می‌رود.
     *
     * مهم:
     * این بخش قبل از Lock رزرو قرار دارد تا
     * Callback تلگرام منتظر قفل رزرو نماند.
     */
    if (
      data &&
      data.telegram_update
    ) {

      return handleTelegramUpdate(
        data.update
      );

    }


    /*
     * قفل برای جلوگیری از رزرو همزمان
     */
    lock.waitLock(15000);


    /* =====================================================
       اطلاعات مشتری
    ===================================================== */

    var firstName =
      cleanValue(
        data.firstName || ""
      );

    var lastName =
      cleanValue(
        data.lastName || ""
      );


    if (
      !firstName &&
      data.name
    ) {

      firstName =
        cleanValue(
          data.name
        );

    }


    var mobile =
      cleanValue(
        data.mobile || ""
      );

    var service =
      cleanValue(
        data.service || ""
      );

    var date =
      cleanValue(
        data.date || ""
      );

    var time =
      normalizeSheetTime(
        data.time || ""
      );

    var discountCode =
      cleanValue(
        data.discountCode || ""
      );


    /* =====================================================
       متن رسید بانکی
    ===================================================== */

    var receiptText =
      cleanValue(
        data.receiptText ||
        data.bankReceiptText ||
        data.receiptDescription ||
        ""
      );


    /* =====================================================
       شماره تراکنش
    ===================================================== */

    var transactionId =
      cleanValue(
        data.transactionId ||
        data.transactionNumber ||
        data.referenceNumber ||
        ""
      );


    /* =====================================================
       تصویر فیش
    ===================================================== */

    var receiptDataUrl =
      cleanValue(
        data.receiptDataUrl || ""
      );

    var receiptName =
      cleanValue(
        data.receiptName ||
        "receipt.jpg"
      );

    var receiptMimeType =
      cleanValue(
        data.receiptMimeType ||
        "image/jpeg"
      );


    /* =====================================================
       شناسه یکتا درخواست
    ===================================================== */

    var clientRequestId =
      cleanValue(
        data.clientRequestId ||
        ""
      );


    if (!clientRequestId) {

      clientRequestId =
        createRequestId();

    }


    /* =====================================================
       Telegram ID
    ===================================================== */

    var telegramChatId =
      cleanValue(
        data.telegramChatId ||
        getTelegramUserIdFromInitData(
          data.telegramInitData || ""
        )
      );


    /* =====================================================
       اطلاعات ضروری
    ===================================================== */

    if (
      !firstName ||
      !lastName ||
      !mobile ||
      !service ||
      !date ||
      !time
    ) {

      return jsonResponse({

        ok: false,

        success: false,

        message:
          "لطفاً همه اطلاعات نوبت را کامل وارد کنید."

      });

    }


    /* =====================================================
       متن رسید بانکی اجباری
    ===================================================== */

    if (!receiptText) {

      return jsonResponse({

        ok: false,

        success: false,

        message:
          "لطفاً متن کامل رسید بانکی را وارد کنید."

      });

    }


    /* =====================================================
       Spreadsheet
    ===================================================== */

    var sheetId =
      PropertiesService
        .getScriptProperties()
        .getProperty(
          PROP_SHEET_ID
        );


    if (!sheetId) {

      throw new Error(
        "BOOKING_SHEET_ID در Script Properties پیدا نشد."
      );

    }


    var ss =
      SpreadsheetApp.openById(
        sheetId
      );


    var bookingSheet =
      getSheetByAliases(
        ss,
        [
          "نوبت‌ها",
          "نوبت ها"
        ]
      );


    if (!bookingSheet) {

      throw new Error(
        "شیت «نوبت‌ها» پیدا نشد."
      );

    }


    ensureBookingHeaders(
      bookingSheet
    );


    /* =====================================================
       وضعیت سیستم
    ===================================================== */

    var systemStatus =
      getSetting(
        ss,
        [
          "وضعیت سیستم"
        ]
      );


    if (
      systemStatus &&
      normalizeText(systemStatus) !==
      normalizeText("فعال")
    ) {

      return jsonResponse({

        ok: false,

        success: false,

        message:
          "سامانه نوبت‌دهی در حال حاضر فعال نیست."

      });

    }


    /* =====================================================
       خدمت
    ===================================================== */

    var serviceInfo =
      getServiceInfo(
        ss,
        service
      );


    if (!serviceInfo) {

      return jsonResponse({

        ok: false,

        success: false,

        message:
          "خدمت انتخاب‌شده معتبر نیست."

      });

    }


    if (!serviceInfo.active) {

      return jsonResponse({

        ok: false,

        success: false,

        message:
          "این خدمت در حال حاضر قابل رزرو نیست."

      });

    }


    var originalPrice =
      serviceInfo.price;


    /* =====================================================
       مشاوره قبل از رزرو
    ===================================================== */

    if (
      serviceInfo.requiresConsultation
    ) {

      var consultationApproved =
        hasApprovedConsultation(
          bookingSheet,
          telegramChatId,
          mobile
        );


      if (!consultationApproved) {

        return jsonResponse({

          ok: false,

          success: false,

          message:
            "برای رزرو این خدمت، ابتدا باید مشاوره شما با ادمین انجام و تأیید شود."

        });

      }

    }


    /* =====================================================
       تخفیف
    ===================================================== */

    var discountInfo =
      calculateDiscount(
        ss,
        discountCode,
        originalPrice,
        date
      );


    if (
      discountCode &&
      !discountInfo.valid
    ) {

      return jsonResponse({

        ok: false,

        success: false,

        message:
          discountInfo.message

      });

    }


    var discountAmount =
      discountInfo.discountAmount || 0;


    var finalPrice =
      Math.max(
        0,
        originalPrice -
        discountAmount
      );


    /* =====================================================
       بررسی ساعات کاری
    ===================================================== */

    if (
      !isWorkingSlot(
        ss,
        date,
        time,
        serviceInfo.duration
      )
    ) {

      return jsonResponse({

        ok: false,

        success: false,

        message:
          "این تاریخ یا ساعت در برنامه کاری کائنات‌چی قرار ندارد."

      });

    }


    /* =====================================================
       بررسی تعطیلی
    ===================================================== */

    if (
      isClosedSlot(
        ss,
        date,
        time,
        serviceInfo.duration
      )
    ) {

      return jsonResponse({

        ok: false,

        success: false,

        message:
          "این ساعت به دلیل تعطیلی قابل رزرو نیست."

      });

    }


    /* =====================================================
       جلوگیری از درخواست تکراری
    ===================================================== */

    var existingRequest =
      findBookingByRequestId(
        bookingSheet,
        clientRequestId
      );


    if (existingRequest) {

      return jsonResponse({

        ok: true,

        success: true,

        alreadyExists: true,

        trackingCode:
          existingRequest.trackingCode,

        status:
          existingRequest.status,

        message:
          "درخواست شما قبلاً ثبت شده است."

      });

    }


    /* =====================================================
       جلوگیری از رزرو همزمان
    ===================================================== */

    var values =
      bookingSheet
        .getDataRange()
        .getValues();


    for (
      var i = 1;
      i < values.length;
      i++
    ) {

      var existingDate =
        cleanValue(
          values[i][1]
        );


      var existingTime =
        normalizeSheetTime(
          values[i][2]
        );


      if (
        !existingDate ||
        !existingTime
      ) {
        continue;
      }


      var existingLegacyStatus =
        cleanValue(
          values[i][8]
        );


      var existingAppointmentStatus =
        values[i].length > 16
          ? cleanValue(values[i][16])
          : "";


      if (
        !isReservedStatus(
          existingLegacyStatus,
          existingAppointmentStatus
        )
      ) {
        continue;
      }


      var existingServiceName =
        cleanValue(
          values[i][5]
        );


      var existingServiceInfo =
        getServiceInfo(
          ss,
          existingServiceName
        );


      var existingDuration =
        existingServiceInfo &&
        existingServiceInfo.duration
          ? existingServiceInfo.duration
          : getDefaultDuration(ss);


      if (
        slotsOverlap(
          date,
          time,
          serviceInfo.duration,
          existingDate,
          existingTime,
          existingDuration
        )
      ) {

        return jsonResponse({

          ok: false,

          success: false,

          message:
            "این ساعت با یک نوبت موجود تداخل دارد. لطفاً ساعت دیگری انتخاب کنید."

        });

      }

    }


    /* =====================================================
       ذخیره تصویر فیش
    ===================================================== */

    var receiptInfo = {

      ok: true,

      url: "",

      id: "",

      name: ""

    };


    if (receiptDataUrl) {

      receiptInfo =
        saveReceiptToDrive(
          receiptDataUrl,
          receiptName,
          receiptMimeType
        );


      if (!receiptInfo.ok) {

        return jsonResponse({

          ok: false,

          success: false,

          message:
            "ذخیره تصویر فیش انجام نشد. لطفاً تصویر را حذف کنید یا دوباره تلاش کنید."

        });

      }

    }


    /* =====================================================
       کد پیگیری واقعی سمت سرور
    ===================================================== */

    var tracking =
      createUniqueTrackingCode(
        bookingSheet
      );


    /* =====================================================
       وضعیت مشاوره
    ===================================================== */

    var consultationStatus =
      serviceInfo.requiresConsultation
        ? "تأیید شده"
        : "نیاز ندارد";


    /* =====================================================
       ثبت نهایی
    ===================================================== */

    var row = [

      new Date(),             // A
      date,                   // B
      time,                   // C
      firstName,              // D
      mobile,                 // E
      service,                // F
      tracking,               // G
      makeSlotKey(date,time), // H
      "در انتظار تأیید",      // I

      lastName,               // J
      discountCode,           // K
      originalPrice,          // L
      discountAmount,         // M
      finalPrice,             // N
      telegramChatId,         // O
      "در انتظار بررسی",      // P
      "در انتظار تأیید",      // Q
      receiptInfo.url,        // R
      consultationStatus,     // S

      receiptText,            // T
      transactionId,          // U
      clientRequestId,        // V
      "",                     // W
      ""                      // X

    ];


    bookingSheet.appendRow(
      row
    );


    /* =====================================================
       ارسال اعلان ادمین
    ===================================================== */

    var telegramResult =
      sendBookingToTelegram({

        name:
          firstName +
          " " +
          lastName,

        firstName:
          firstName,

        lastName:
          lastName,

        mobile:
          mobile,

        service:
          service,

        date:
          date,

        time:
          time,

        trackingCode:
          tracking,

        originalPrice:
          originalPrice,

        discountCode:
          discountCode,

        discountAmount:
          discountAmount,

        finalPrice:
          finalPrice,

        receiptUrl:
          receiptInfo.url,

        receiptText:
          receiptText,

        transactionId:
          transactionId,

        telegramChatId:
          telegramChatId

      });


    if (!telegramResult.ok) {

      console.error(
        "Telegram notification failed: " +
        telegramResult.error
      );

    }


    /* =====================================================
       پیام به مشتری
    ===================================================== */

    if (telegramChatId) {

      sendCustomerBookingPending(
        telegramChatId,
        {
          trackingCode:
            tracking,

          date:
            date,

          time:
            time,

          service:
            service

        }
      );

    }


    /* =====================================================
       نتیجه واقعی سرور
    ===================================================== */

    return jsonResponse({

      ok: true,

      success: true,

      trackingCode:
        tracking,

      clientRequestId:
        clientRequestId,

      date:
        date,

      time:
        time,

      status:
        "در انتظار تأیید",

      message:
        "درخواست شما با موفقیت ثبت شد و در انتظار تأیید ادمین است."

    });


  } catch (error) {

    console.error(
      "Booking error: " +
      error.message
    );


    return jsonResponse({

      ok: false,

      success: false,

      message:
        "خطا در ثبت نوبت: " +
        error.message

    });


  } finally {

    try {

      lock.releaseLock();

    } catch (e) {}

  }

}


/* =========================================================
   دریافت POST
========================================================= */

function receivePostData(e) {

  var data = {};


  if (
    e &&
    e.postData &&
    e.postData.contents
  ) {

    try {

      var json =
        JSON.parse(
          e.postData.contents
        );


      /*
       * Telegram Webhook
       */
      if (
        json &&
        json.update_id !== undefined
      ) {

        return {

          telegram_update: true,

          update:
            json

        };

      }


      if (
        json &&
        typeof json === "object"
      ) {

        data =
          json;

      }

    } catch (error) {

      console.error(
        "JSON parse error: " +
        error.message
      );

    }

  }


  /*
   * فرم معمولی
   */
  if (
    e &&
    e.parameter
  ) {

    var p =
      e.parameter;


    var keys = [

      "firstName",
      "lastName",
      "name",
      "mobile",
      "service",
      "date",
      "time",
      "discountCode",
      "receiptDataUrl",
      "receiptName",
      "receiptMimeType",
      "receiptText",
      "bankReceiptText",
      "transactionId",
      "transactionNumber",
      "referenceNumber",
      "telegramChatId",
      "telegramInitData",
      "clientRequestId"

    ];


    keys.forEach(
      function(key) {

        if (
          p[key] !== undefined &&
          p[key] !== null
        ) {

          data[key] =
            p[key];

        }

      }
    );

  }


  return data;

}


/* =========================================================
   GET
========================================================= */

function doGet(e) {

  var action =
    e &&
    e.parameter
      ? e.parameter.action || ""
      : "";


  if (
    action ===
    "getConfig"
  ) {

    return jsonResponse(
      getPublicConfig()
    );

  }


  if (
    action ===
    "getBookedSlots"
  ) {

    return jsonResponse(
      getBookedSlots()
    );

  }


  if (
    action ===
    "bookingStatus"
  ) {

    var requestId =
      cleanValue(
        e.parameter.requestId ||
        ""
      );


    return jsonResponse(
      getBookingStatus(
        requestId
      )
    );

  }


  /*
   * بررسی Webhook
   */
  if (action === "centralAdminClosures") {
    return jsonResponse(getAdminClosures());
  }

  if (
    action ===
    "webhookInfo"
  ) {

    return jsonResponse(
      getTelegramWebhookInfo()
    );

  }


  return ContentService
    .createTextOutput(
      "سامانه نوبت‌دهی کائنات‌چی فعال است"
    )
    .setMimeType(
      ContentService.MimeType.TEXT
    );

}


/* =========================================================
   وضعیت Booking
========================================================= */

function getBookingStatus(
  requestId
) {

  if (!requestId) {

    return {

      ok: false,

      found: false,

      message:
        "شناسه درخواست ارسال نشده است."

    };

  }


  var sheetId =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        PROP_SHEET_ID
      );


  if (!sheetId) {

    return {

      ok: false,

      found: false,

      message:
        "BOOKING_SHEET_ID پیدا نشد."

    };

  }


  var ss =
    SpreadsheetApp.openById(
      sheetId
    );


  var sheet =
    getSheetByAliases(
      ss,
      [
        "نوبت‌ها",
        "نوبت ها"
      ]
    );


  if (!sheet) {

    return {

      ok: false,

      found: false

    };

  }


  var result =
    findBookingByRequestId(
      sheet,
      requestId
    );


  if (!result) {

    return {

      ok: true,

      found: false

    };

  }


  return {

    ok: true,

    found: true,

    trackingCode:
      result.trackingCode,

    status:
      result.status,

    paymentStatus:
      result.paymentStatus,

    appointmentStatus:
      result.appointmentStatus,

    date:
      result.date,

    time:
      result.time,

    service:
      result.service,

    message:
      "درخواست شما در سامانه ثبت شده است."

  };

}


/* =========================================================
   پیدا کردن Booking با Request ID
========================================================= */

function findBookingByRequestId(
  sheet,
  requestId
) {

  if (
    !sheet ||
    !requestId
  ) {

    return null;

  }


  var values =
    sheet
      .getDataRange()
      .getValues();


  var wanted =
    normalizeText(
      requestId
    );


  for (
    var i =
      values.length - 1;
    i >= 1;
    i--
  ) {

    var rowRequestId =
      values[i].length > 21
        ? cleanValue(values[i][21])
        : "";


    if (
      normalizeText(
        rowRequestId
      ) !== wanted
    ) {

      continue;

    }


    return {

      row:
        i + 1,

      trackingCode:
        cleanValue(
          values[i][6]
        ),

      status:
        cleanValue(
          values[i][8]
        ),

      date:
        cleanValue(
          values[i][1]
        ),

      time:
        normalizeSheetTime(
          values[i][2]
        ),

      service:
        cleanValue(
          values[i][5]
        ),

      paymentStatus:
        values[i].length > 15
          ? cleanValue(values[i][15])
          : "",

      appointmentStatus:
        values[i].length > 16
          ? cleanValue(values[i][16])
          : ""

    };

  }


  return null;

}


/* =========================================================
   Public Config
========================================================= */

function getPublicConfig() {

  var sheetId =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        PROP_SHEET_ID
      );


  if (!sheetId) {

    return {

      ok: false,

      message:
        "BOOKING_SHEET_ID پیدا نشد."

    };

  }


  var ss =
    SpreadsheetApp.openById(
      sheetId
    );


  var settings = {

    slotInterval:
      getNumberSetting(
        ss,
        [
          "فاصله نوبت‌ها",
          "فاصله نوبت ها"
        ],
        30
      ),

    duration:
      getNumberSetting(
        ss,
        [
          "مدت هر نوبت"
        ],
        30
      ),

    days:
      getNumberSetting(
        ss,
        [
          "تعداد روزهای قابل رزرو",
          "تعداد روز های قبل رزرو",
          "تعداد روزهای قبل رزرو",
          "تعداد روز های قابل رزرو"
        ],
        7
      )

  };


  return {

    ok: true,

    settings:
      settings,

    services:
      getPublicServices(
        ss
      ),

    workHours:
      getWorkHours(
        ss
      ),

    closures:
      getPublicClosures(
        ss
      ),

    bookedSlots:
      getBookedSlots()

  };

}


/* =========================================================
   Services
========================================================= */

function getPublicServices(
  ss
) {

  var sheet =
    getSheetByAliases(
      ss,
      [
        "خدمات"
      ]
    );


  if (!sheet) {
    return [];
  }


  var values =
    sheet
      .getDataRange()
      .getValues();


  var result = [];


  for (
    var i = 1;
    i < values.length;
    i++
  ) {

    var name =
      cleanValue(
        values[i][0]
      );


    if (!name) {
      continue;
    }


    var category =
      cleanValue(
        values[i][1]
      );

    var price =
      parseMoney(
        values[i][2]
      );

    var status =
      cleanValue(
        values[i][3]
      );

    var description =
      cleanValue(
        values[i][4]
      );

    var duration =
      parseMoney(
        values[i][5]
      );

    var consultation =
      cleanValue(
        values[i][6]
      );


    if (
      !duration ||
      duration <= 0
    ) {

      duration =
        getDefaultDuration(
          ss
        );

    }


    if (
      normalizeText(status) ===
      normalizeText("فعال")
    ) {

      result.push({

        name:
          name,

        category:
          category,

        price:
          price,

        description:
          description,

        duration:
          duration,

        requiresConsultation:
          isYesValue(
            consultation
          )

      });

    }

  }


  return result;

}


/* =========================================================
   اطلاعات خدمت
========================================================= */

function getServiceInfo(
  ss,
  serviceName
) {

  var sheet =
    getSheetByAliases(
      ss,
      [
        "خدمات"
      ]
    );


  if (!sheet) {
    return null;
  }


  var values =
    sheet
      .getDataRange()
      .getValues();


  var wanted =
    normalizeText(
      serviceName
    );


  for (
    var i = 1;
    i < values.length;
    i++
  ) {

    var name =
      cleanValue(
        values[i][0]
      );


    if (
      normalizeText(name) !==
      wanted
    ) {

      continue;

    }


    var status =
      cleanValue(
        values[i][3]
      );


    var duration =
      parseMoney(
        values[i][5]
      );


    if (
      !duration ||
      duration <= 0
    ) {

      duration =
        getDefaultDuration(
          ss
        );

    }


    return {

      name:
        name,

      category:
        cleanValue(
          values[i][1]
        ),

      price:
        parseMoney(
          values[i][2]
        ),

      active:
        normalizeText(status) ===
        normalizeText("فعال"),

      description:
        cleanValue(
          values[i][4]
        ),

      duration:
        duration,

      requiresConsultation:
        isYesValue(
          cleanValue(
            values[i][6]
          )
        )

    };

  }


  return null;

}


/* =========================================================
   مشاوره
========================================================= */

function hasApprovedConsultation(
  bookingSheet,
  telegramChatId,
  mobile
) {

  var values =
    bookingSheet
      .getDataRange()
      .getValues();


  var wantedTelegram =
    normalizeText(
      telegramChatId
    );


  var wantedMobile =
    normalizeText(
      mobile
    );


  for (
    var i =
      values.length - 1;
    i >= 1;
    i--
  ) {

    var rowTelegram =
      values[i].length > 14
        ? normalizeText(values[i][14])
        : "";


    var rowMobile =
      normalizeText(
        values[i][4]
      );


    var consultationStatus =
      values[i].length > 18
        ? normalizeText(values[i][18])
        : "";


    var matched =
      (
        wantedTelegram &&
        rowTelegram &&
        rowTelegram ===
        wantedTelegram
      ) ||
      (
        wantedMobile &&
        rowMobile &&
        rowMobile ===
        wantedMobile
      );


    if (!matched) {
      continue;
    }


    if (
      consultationStatus ===
      normalizeText("تأیید شده")
    ) {

      return true;

    }


    if (
      consultationStatus ===
      normalizeText("رد شده") ||
      consultationStatus ===
      normalizeText("لغو شده")
    ) {

      return false;

    }

  }


  return false;

}


/* =========================================================
   ساعات کاری
========================================================= */

function getWorkHours(
  ss
) {

  var sheet =
    getSheetByAliases(
      ss,
      [
        "ساعات کاری",
        "ساعت ها",
        "ساعت‌ها"
      ]
    );


  if (!sheet) {
    return [];
  }


  var values =
    sheet
      .getDataRange()
      .getValues();


  var result = [];


  for (
    var i = 1;
    i < values.length;
    i++
  ) {

    var day =
      cleanValue(
        values[i][0]
      );

    var shift =
      cleanValue(
        values[i][1]
      );

    var start =
      normalizeSheetTime(
        values[i][2]
      );

    var end =
      normalizeSheetTime(
        values[i][3]
      );

    var status =
      cleanValue(
        values[i][4]
      );


    if (
      !day ||
      !start ||
      !end ||
      normalizeText(status) !==
      normalizeText("فعال")
    ) {

      continue;

    }


    result.push({

      day:
        day,

      shift:
        shift,

      start:
        start,

      end:
        end

    });

  }


  return result;

}


/* =========================================================
   زمان
========================================================= */

function normalizeSheetTime(
  value
) {

  if (
    Object.prototype.toString.call(value) ===
    "[object Date]" &&
    !isNaN(value.getTime())
  ) {

    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "HH:mm"
    );

  }

  var text =
    cleanValue(
      value
    );

  text =
    toEnglishDigits(
      text
    );

  var match =
    text.match(
      /^(\d{1,2}):(\d{2})$/
    );

  if (match) {

    return (
      pad2(
        Number(match[1])
      ) +
      ":" +
      pad2(
        Number(match[2])
      )
    );

  }

  var hourOnly =
    text.match(
      /^(\d{1,2})$/
    );

  if (hourOnly) {

    return (
      pad2(
        Number(hourOnly[1])
      ) +
      ":00"
    );

  }

  return text;

}


function timeToMinutes(
  time
) {

  var value =
    cleanValue(
      time
    );


  value =
    toEnglishDigits(
      value
    );


  var match =
    value.match(
      /^(\d{1,2}):(\d{2})$/
    );


  if (!match) {
    return null;
  }


  var h =
    Number(
      match[1]
    );


  var m =
    Number(
      match[2]
    );


  if (
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {

    return null;

  }


  return (
    h * 60 +
    m
  );

}


function addMinutesToTime(
  time,
  minutes
) {

  var total =
    timeToMinutes(
      normalizeSheetTime(
        time
      )
    );


  if (total === null) {
    return time;
  }


  total +=
    Number(minutes) || 0;


  var h =
    Math.floor(
      total / 60
    );


  var m =
    total % 60;


  return (
    pad2(h) +
    ":" +
    pad2(m)
  );

}


function pad2(
  value
) {

  return String(
    value
  ).padStart(
    2,
    "0"
  );

}


/* =========================================================
   بررسی ساعات کاری
========================================================= */

function isWorkingSlot(
  ss,
  date,
  time,
  duration
) {

  var day =
    getJalaliWeekday(
      date
    );


  if (!day) {
    return false;
  }


  var sheet =
    getSheetByAliases(
      ss,
      [
        "ساعات کاری",
        "ساعت ها",
        "ساعت‌ها"
      ]
    );


  if (!sheet) {
    return false;
  }


  var values =
    sheet
      .getDataRange()
      .getValues();


  var targetMinutes =
    timeToMinutes(
      normalizeSheetTime(
        time
      )
    );


  if (
    targetMinutes === null
  ) {

    return false;

  }


  duration =
    Number(duration) ||
    getDefaultDuration(
      ss
    );


  for (
    var i = 1;
    i < values.length;
    i++
  ) {

    var rowDay =
      cleanValue(
        values[i][0]
      );


    var start =
      normalizeSheetTime(
        values[i][2]
      );


    var end =
      normalizeSheetTime(
        values[i][3]
      );


    var status =
      cleanValue(
        values[i][4]
      );


    if (
      normalizeText(rowDay) !==
      normalizeText(day)
    ) {

      continue;

    }


    if (
      normalizeText(status) !==
      normalizeText("فعال")
    ) {

      continue;

    }


    var startMinutes =
      timeToMinutes(
        start
      );


    var endMinutes =
      timeToMinutes(
        end
      );


    if (
      startMinutes === null ||
      endMinutes === null
    ) {

      continue;

    }


    if (
      targetMinutes >= startMinutes &&
      targetMinutes + duration <=
      endMinutes
    ) {

      return true;

    }

  }


  return false;

}


/* =========================================================
   تعطیلی
========================================================= */

function getPublicClosures(
  ss
) {

  var sheet =
    getSheetByAliases(
      ss,
      [
        "تعطیلی ها",
        "تعطیلی‌ها"
      ]
    );


  if (!sheet) {
    return [];
  }


  var values =
    sheet
      .getDataRange()
      .getDisplayValues();


  var result = [];


  for (
    var i = 1;
    i < values.length;
    i++
  ) {

    var startDate =
      cleanValue(
        values[i][0]
      );


    var startTime =
      normalizeSheetTime(
        values[i][1]
      );


    var endDate =
      cleanValue(
        values[i][2]
      );


    var endTime =
      normalizeSheetTime(
        values[i][3]
      );


    var status =
      cleanValue(
        values[i][4]
      );


    if (
      !startDate ||
      !endDate
    ) {

      continue;

    }


    if (
      normalizeText(status) !==
      normalizeText("فعال")
    ) {

      continue;

    }


    result.push({

      startDate:
        startDate,

      startTime:
        startTime ||
        "00:00",

      endDate:
        endDate,

      endTime:
        endTime ||
        "23:59"

    });

  }


  return result;

}


function isClosedSlot(
  ss,
  date,
  time,
  duration
) {

  var sheet =
    getSheetByAliases(
      ss,
      [
        "تعطیلی ها",
        "تعطیلی‌ها"
      ]
    );


  if (!sheet) {
    return false;
  }


  var target =
    dateTimeKey(
      date,
      normalizeSheetTime(
        time
      )
    );


  if (target === null) {
    return false;
  }


  duration =
    Number(duration) ||
    getDefaultDuration(
      ss
    );


  var targetEnd =
    target +
    duration;


  var values =
    sheet
      .getDataRange()
      .getValues();


  for (
    var i = 1;
    i < values.length;
    i++
  ) {

    var status =
      cleanValue(
        values[i][4]
      );


    if (
      normalizeText(status) !==
      normalizeText("فعال")
    ) {

      continue;

    }


    var startDate =
      cleanValue(
        values[i][0]
      );


    var startTime =
      normalizeSheetTime(
        values[i][1]
      ) ||
      "00:00";


    var endDate =
      cleanValue(
        values[i][2]
      );


    var endTime =
      normalizeSheetTime(
        values[i][3]
      ) ||
      "23:59";


    if (
      !startDate ||
      !endDate
    ) {

      continue;

    }


    var closureStart =
      dateTimeKey(
        startDate,
        startTime
      );


    var closureEnd =
      dateTimeKey(
        endDate,
        endTime
      );


    if (
      closureStart === null ||
      closureEnd === null
    ) {

      continue;

    }


    if (
      target < closureEnd &&
      targetEnd > closureStart
    ) {

      return true;

    }

  }


  return false;

}


/* =========================================================
   نوبت‌های رزرو شده
========================================================= */

function getBookedSlots() {
  var ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID)
  );

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // مهم:
  // تاریخ و ساعت را از مقدار نمایشی Sheet می‌خوانیم،
  // نه Date Object داخلی Google Sheets.
  var displayValues = sheet
    .getRange(2, 1, lastRow - 1, 24)
    .getDisplayValues();

  // ساخت نقشه مدت خدمات
  var serviceDurations = {};
  var servicesSheet = ss.getSheetByName("خدمات");

  if (servicesSheet && servicesSheet.getLastRow() >= 2) {
    var serviceRows = servicesSheet
      .getRange(2, 1, servicesSheet.getLastRow() - 1, 6)
      .getDisplayValues();

    serviceRows.forEach(function(row) {
      var serviceName = String(row[0] || "").trim();
      var duration = Number(
        String(row[5] || "").replace(/[^\d.]/g, "")
      );

      if (serviceName && duration > 0) {
        serviceDurations[serviceName] = duration;
      }
    });
  }

  var result = [];

  displayValues.forEach(function(row) {
    // ستون‌های نوبت‌ها:
    // B = تاریخ
    // C = ساعت
    // F = خدمت
    // G = کد پیگیری
    // I = وضعیت
    // Q = وضعیت نوبت

    var date = normalizeBookedDate(row[1]);
    var time = normalizeBookedTime(row[2]);
    var service = String(row[5] || "").trim();
    var trackingCode = String(row[6] || "").trim();
    var statusI = String(row[8] || "").trim();
    var statusQ = String(row[16] || "").trim();

    if (!date || !time) return;

    // اگر هیچ وضعیت رزروی وجود ندارد، این ردیف نوبت محسوب نمی‌شود.
    if (!statusI && !statusQ) return;

    // لغو شده یا رد شده نباید ساعت را اشغال کند.
    if (
      statusI === "لغو شده" ||
      statusI === "رد شده" ||
      statusQ === "لغو شده" ||
      statusQ === "رد شده"
    ) {
      return;
    }

    var status = statusQ || statusI;

    // مدت خدمت
    var duration = 30;

    Object.keys(serviceDurations).some(function(serviceName) {
      if (
        service === serviceName ||
        service.indexOf(serviceName) !== -1
      ) {
        duration = serviceDurations[serviceName];
        return true;
      }
      return false;
    });

    result.push({
      date: date,
      time: time,
      duration: duration,
      service: service,
      status: status,
      trackingCode: trackingCode
    });
  });

  return result;
}


/**
 * تاریخ را به فرمت استاندارد YYYY/MM/DD برمی‌گرداند.
 * مثال:
 * 1405/07/11
 * ۱۴۰۵/۰۷/۱۱
 */
function normalizeBookedDate(value) {
  var s = String(value || "")
    .trim()
    .replace(/۰/g, "0")
    .replace(/۱/g, "1")
    .replace(/۲/g, "2")
    .replace(/۳/g, "3")
    .replace(/۴/g, "4")
    .replace(/۵/g, "5")
    .replace(/۶/g, "6")
    .replace(/۷/g, "7")
    .replace(/۸/g, "8")
    .replace(/۹/g, "9");

  var match = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);

  if (!match) return "";

  return (
    match[1] +
    "/" +
    ("0" + match[2]).slice(-2) +
    "/" +
    ("0" + match[3]).slice(-2)
  );
}


/**
 * ساعت را به فرمت HH:MM برمی‌گرداند.
 * مثال:
 * 11:00
 * 7:30
 */
function normalizeBookedTime(value) {
  var s = String(value || "")
    .trim()
    .replace(/۰/g, "0")
    .replace(/۱/g, "1")
    .replace(/۲/g, "2")
    .replace(/۳/g, "3")
    .replace(/۴/g, "4")
    .replace(/۵/g, "5")
    .replace(/۶/g, "6")
    .replace(/۷/g, "7")
    .replace(/۸/g, "8")
    .replace(/۹/g, "9");

  var match = s.match(/^(\d{1,2}):(\d{1,2})/);

  if (!match) return "";

  return (
    ("0" + match[1]).slice(-2) +
    ":" +
    ("0" + match[2]).slice(-2)
  );
}


/* =========================================================
   وضعیت رزرو
========================================================= */

function isReservedStatus(
  legacyStatus,
  appointmentStatus
) {

  var a =
    normalizeLooseText(
      legacyStatus
    );

  var b =
    normalizeLooseText(
      appointmentStatus
    );

  /*
   * فقط این دو وضعیت باعث آزاد شدن نوبت می‌شوند.
   */
  if (
    a === "رد شده" ||
    a === "لغو شده" ||
    b === "رد شده" ||
    b === "لغو شده"
  ) {
    return false;
  }

  /*
   * هر وضعیت دیگری یعنی نوبت اشغال است.
   *
   * بنابراین:
   * در انتظار تأیید = رزرو شده
   * تأیید شده = رزرو شده
   * در انتظار بررسی = رزرو شده
   */
  return !!(
    a ||
    b
  );
}

/* =========================================================
   تداخل نوبت‌ها
========================================================= */

function slotsOverlap(
  date1,
  time1,
  duration1,
  date2,
  time2,
  duration2
) {

  var normalizedDate1 =
    normalizeLooseText(date1);

  var normalizedDate2 =
    normalizeLooseText(date2);

  var t1 =
    timeToMinutes(
      normalizeSheetTime(time1)
    );

  var t2 =
    timeToMinutes(
      normalizeSheetTime(time2)
    );

  if (
    t1 === null ||
    t2 === null
  ) {
    return false;
  }

  duration1 =
    Number(duration1) || 30;

  duration2 =
    Number(duration2) || 30;

  /*
   * اگر تاریخ‌ها دقیقاً یکی باشند،
   * مستقیماً تداخل ساعت را بررسی می‌کنیم.
   *
   * این بخش باعث می‌شود فرمت‌هایی مثل
   * «1404/07/09» یا «پنج‌شنبه 9 مهر»
   * در صورت یکسان بودن، درست تشخیص داده شوند.
   */
  if (
    normalizedDate1 &&
    normalizedDate2 &&
    normalizedDate1 === normalizedDate2
  ) {

    var end1 =
      t1 + duration1;

    var end2 =
      t2 + duration2;

    return (
      t1 < end2 &&
      end1 > t2
    );
  }

  /*
   * اگر تاریخ‌ها عدد جلالی باشند،
   * تبدیل دقیق روز انجام می‌شود.
   */
  var d1 =
    jalaliDayNumber(date1);

  var d2 =
    jalaliDayNumber(date2);

  if (
    d1 !== null &&
    d2 !== null
  ) {

    var start1 =
      d1 * 1440 + t1;

    var start2 =
      d2 * 1440 + t2;

    var end1 =
      start1 + duration1;

    var end2 =
      start2 + duration2;

    return (
      start1 < end2 &&
      end1 > start2
    );
  }

  /*
   * اگر هیچ‌کدام از روش‌های بالا جواب نداد،
   * فقط در صورتی تداخل را قبول می‌کنیم
   * که تاریخ‌ها واقعاً یکسان باشند.
   */
  return false;
}


/* =========================================================
   تاریخ و زمان کلیدی
========================================================= */

function dateTimeKey(
  date,
  time
) {

  var day =
    jalaliDayNumber(
      date
    );


  var minutes =
    timeToMinutes(
      normalizeSheetTime(
        time
      )
    );


  if (
    day === null ||
    minutes === null
  ) {

    return null;

  }


  return (
    day * 1440 +
    minutes
  );

}


/* =========================================================
   عدد واقعی روز جلالی
========================================================= */

function jalaliDayNumber(
  date
) {

  var parsed =
    parseJalaliDate(
      date
    );


  if (!parsed) {
    return null;
  }


  var g =
    jalaliToGregorian(
      parsed.y,
      parsed.m,
      parsed.d
    );


  if (!g) {
    return null;
  }


  return Math.floor(
    Date.UTC(
      g.getFullYear(),
      g.getMonth(),
      g.getDate()
    ) /
    86400000
  );

}


/* =========================================================
   تبدیل تاریخ جلالی
========================================================= */

function parseJalaliDate(
  date
) {

  var value =
    cleanValue(
      date
    );


  value =
    toEnglishDigits(
      value
    )
      .replace(
        /-/g,
        "/"
      )
      .replace(
        /\./g,
        "/"
      );


  var parts =
    value.split(
      "/"
    );


  if (
    parts.length !== 3
  ) {

    return null;

  }


  var y =
    Number(
      parts[0]
    );


  var m =
    Number(
      parts[1]
    );


  var d =
    Number(
      parts[2]
    );


  if (
    !y ||
    !m ||
    !d ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  ) {

    return null;

  }


  return {

    y:
      y,

    m:
      m,

    d:
      d

  };

}


function jalaliDateNumber(
  date
) {

  var parsed =
    parseJalaliDate(
      date
    );


  if (!parsed) {
    return null;
  }


  return (
    parsed.y * 10000 +
    parsed.m * 100 +
    parsed.d
  );

}


function compareJalaliDates(
  a,
  b
) {

  var x =
    jalaliDateNumber(
      a
    );


  var y =
    jalaliDateNumber(
      b
    );


  if (
    x === null ||
    y === null
  ) {

    return 0;

  }


  if (x < y) {
    return -1;
  }


  if (x > y) {
    return 1;
  }


  return 0;

}


/* =========================================================
   روز هفته شمسی
========================================================= */

function getJalaliWeekday(
  jalaliDate
) {

  var parsed =
    parseJalaliDate(
      jalaliDate
    );


  if (!parsed) {
    return "";
  }


  var g =
    jalaliToGregorian(
      parsed.y,
      parsed.m,
      parsed.d
    );


  if (!g) {
    return "";
  }


  var day =
    g.getDay();


  var names = [

    "یکشنبه",
    "دوشنبه",
    "سه شنبه",
    "چهارشنبه",
    "پنج شنبه",
    "جمعه",
    "شنبه"

  ];


  return names[day];

}


/* =========================================================
   تبدیل جلالی به میلادی
========================================================= */

function jalaliToGregorian(
  jy,
  jm,
  jd
) {

  try {

    var gy =
      jy > 979
        ? 1600
        : 621;


    var jy2 =
      jy > 979
        ? jy - 979
        : jy;


    var days =
      365 * jy2 +
      Math.floor(
        jy2 / 33
      ) * 8 +
      Math.floor(
        (jy2 % 33 + 3) / 4
      ) +
      78 +
      jd;


    if (jm < 7) {

      days +=
        (jm - 1) * 31;

    } else {

      days +=
        (jm - 7) * 30 +
        186;

    }


    gy +=
      400 *
      Math.floor(
        days / 146097
      );


    days =
      days % 146097;


    if (days > 36524) {

      gy +=
        100 *
        Math.floor(
          --days /
          36524
        );


      days =
        days % 36524;


      if (days >= 365) {
        days++;
      }

    }


    gy +=
      4 *
      Math.floor(
        days / 1461
      );


    days =
      days % 1461;


    if (days > 365) {

      gy +=
        Math.floor(
          (days - 1) /
          365
        );


      days =
        (days - 1) %
        365;

    }


    var gd =
      days + 1;


    var leap =
      (
        gy % 4 === 0 &&
        gy % 100 !== 0
      ) ||
      gy % 400 === 0;


    var monthDays = [

      0,
      31,
      leap ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31

    ];


    var gm = 1;


    while (
      gm <= 12 &&
      gd > monthDays[gm]
    ) {

      gd -=
        monthDays[gm];


      gm++;

    }


    return new Date(
      gy,
      gm - 1,
      gd
    );


  } catch (error) {

    return null;

  }

}


/* =========================================================
   تخفیف
========================================================= */

function calculateDiscount(
  ss,
  code,
  originalPrice,
  bookingDate
) {

  if (!code) {

    return {

      valid: true,

      discountAmount: 0

    };

  }


  var sheet =
    getSheetByAliases(
      ss,
      [
        "تخفیف ها",
        "تخفیف‌ها"
      ]
    );


  if (!sheet) {

    return {

      valid: false,

      message:
        "کد تخفیف معتبر نیست."

    };

  }


  var values =
    sheet
      .getDataRange()
      .getValues();


  var wanted =
    normalizeText(
      code
    );


  for (
    var i = 1;
    i < values.length;
    i++
  ) {

    var rowCode =
      cleanValue(
        values[i][0]
      );


    if (
      normalizeText(rowCode) !==
      wanted
    ) {

      continue;

    }


    var type =
      normalizeText(
        values[i][1]
      );


    var amount =
      parseMoney(
        values[i][2]
      );


    var startDate =
      cleanValue(
        values[i][3]
      );


    var endDate =
      cleanValue(
        values[i][4]
      );


    var maxUses =
      parseMoney(
        values[i][5]
      );


    var status =
      normalizeText(
        values[i][6]
      );


    if (
      status !==
      normalizeText("فعال")
    ) {

      return {

        valid: false,

        message:
          "این کد تخفیف فعال نیست."

      };

    }


    if (
      startDate &&
      compareJalaliDates(
        bookingDate,
        startDate
      ) < 0
    ) {

      return {

        valid: false,

        message:
          "این کد تخفیف هنوز فعال نشده است."

      };

    }


    if (
      endDate &&
      compareJalaliDates(
        bookingDate,
        endDate
      ) > 0
    ) {

      return {

        valid: false,

        message:
          "اعتبار این کد تخفیف به پایان رسیده است."

      };

    }


    var used =
      countDiscountUses(
        ss,
        rowCode
      );


    if (
      maxUses > 0 &&
      used >= maxUses
    ) {

      return {

        valid: false,

        message:
          "سقف استفاده از این کد تخفیف تکمیل شده است."

      };

    }


    var discountAmount =
      0;


    if (
      type === "درصدی" ||
      type === "درصد" ||
      type === "%"
    ) {

      discountAmount =
        Math.round(
          originalPrice *
          amount /
          100
        );

    } else {

      discountAmount =
        amount;

    }


    discountAmount =
      Math.min(
        discountAmount,
        originalPrice
      );


    return {

      valid: true,

      discountAmount:
        discountAmount,

      type:
        type,

      value:
        amount

    };

  }


  return {

    valid: false,

    message:
      "کد تخفیف واردشده معتبر نیست."

  };

}


/* =========================================================
   شمارش تخفیف
========================================================= */

function countDiscountUses(
  ss,
  code
) {

  var sheet =
    getSheetByAliases(
      ss,
      [
        "نوبت‌ها",
        "نوبت ها"
      ]
    );


  if (!sheet) {
    return 0;
  }


  var values =
    sheet
      .getDataRange()
      .getValues();


  var count =
    0;


  for (
    var i = 1;
    i < values.length;
    i++
  ) {

    var existingCode =
      cleanValue(
        values[i][10]
      );


    var paymentStatus =
      values[i].length > 15
        ? normalizeText(values[i][15])
        : "";


    var appointmentStatus =
      values[i].length > 16
        ? normalizeText(values[i][16])
        : "";


    if (
      normalizeText(existingCode) ===
      normalizeText(code) &&
      paymentStatus ===
      normalizeText("پرداخت تأیید شد") &&
      appointmentStatus ===
      normalizeText("تأیید شده")
    ) {

      count++;

    }

  }


  return count;

}


/* =========================================================
   ذخیره فیش در Drive
========================================================= */

function saveReceiptToDrive(
  dataUrl,
  fileName,
  mimeType
) {

  try {

    var folderId =
      PropertiesService
        .getScriptProperties()
        .getProperty(
          PROP_RECEIPTS_FOLDER_ID
        );


    if (!folderId) {

      throw new Error(
        "RECEIPTS_FOLDER_ID پیدا نشد."
      );

    }


    if (!dataUrl) {

      return {

        ok: true,

        url: ""

      };

    }


    var parts =
      dataUrl.split(
        ","
      );


    var base64 =
      parts.length > 1
        ? parts[1]
        : parts[0];


    var bytes =
      Utilities.base64Decode(
        base64
      );


    var blob =
      Utilities.newBlob(
        bytes,
        mimeType ||
        "image/jpeg",
        fileName ||
        "receipt.jpg"
      );


    var folder =
      DriveApp.getFolderById(
        folderId
      );


    var file =
      folder.createFile(
        blob
      );


    return {

      ok: true,

      id:
        file.getId(),

      url:
        file.getUrl(),

      name:
        file.getName()

    };


  } catch (error) {

    console.error(
      "Receipt Drive error: " +
      error.message
    );


    return {

      ok: false,

      error:
        error.message

    };

  }

}


/* =========================================================
   Telegram — پیام ادمین
========================================================= */

function sendBookingToTelegram(data) {

  try {

    var props =
      PropertiesService
        .getScriptProperties();

    var botToken =
      props.getProperty(
        PROP_BOT_TOKEN
      );

    var chatId =
      props.getProperty(
        PROP_CHAT_ID
      );

    if (
      botToken == null ||
      botToken == "" ||
      chatId == null ||
      chatId == ""
    ) {

      throw new Error(
        "TELEGRAM_BOT_TOKEN یا TELEGRAM_CHAT_ID پیدا نشد."
      );

    }

    var caption =
      "🌿 نوبت جدید کائنات‌چی\n\n" +

      "👤 نام: " +
      data.name +

      "\n📱 موبایل: " +
      data.mobile +

      "\n🔮 خدمت: " +
      data.service +

      "\n📅 تاریخ: " +
      data.date +

      "\n⏰ ساعت: " +
      data.time +

      "\n🎫 کد پیگیری: " +
      data.trackingCode +

      "\n\n💰 مبلغ اصلی: " +
      formatMoney(
        data.originalPrice
      ) +
      " تومان";

    if (data.discountCode) {

      caption +=
        "\n🎟 کد تخفیف: " +
        data.discountCode +

        "\n➖ تخفیف: " +
        formatMoney(
          data.discountAmount
        ) +
        " تومان";

    }

    caption +=
      "\n💳 مبلغ نهایی: " +
      formatMoney(
        data.finalPrice
      ) +
      " تومان";

    caption +=
      "\n\n🧾 متن رسید بانکی:\n" +
      data.receiptText;

    if (data.transactionId) {

      caption +=
        "\n\n🔢 شماره تراکنش: " +
        data.transactionId;

    }

    if (data.receiptUrl) {

      caption +=
        "\n\n🖼 تصویر فیش: " +
        data.receiptUrl;

    } else {

      caption +=
        "\n\n🖼 تصویر فیش: ارسال نشده";

    }

    var telegramIdText = "ثبت نشده";

    if (
      data.telegramChatId != null &&
      data.telegramChatId != ""
    ) {

      telegramIdText =
        String(
          data.telegramChatId
        );

    }

    caption +=
      "\n\n🆔 Telegram ID: " +
      telegramIdText;

    caption +=
      "\n\n⏳ وضعیت: در انتظار تأیید";

    var url =
      "https://api.telegram.org/bot" +
      botToken +
      "/sendMessage";

    var payload = {

      chat_id:
        chatId,

      text:
        caption,

      reply_markup:
        JSON.stringify({

          inline_keyboard: [

            [

              {

                text:
                  "✅ تأیید نوبت",

                callback_data:
                  "approve|" +
                  data.trackingCode

              },

              {

                text:
                  "❌ رد نوبت",

                callback_data:
                  "reject|" +
                  data.trackingCode

              }

            ]

          ]

        })

    };

    var response =
      UrlFetchApp.fetch(
        url,
        {

          method:
            "post",

          payload:
            payload,

          muteHttpExceptions:
            true

        }
      );

    var result =
      JSON.parse(
        response.getContentText()
      );

    if (result.ok !== true) {

      var errorDescription =
        "ارسال پیام ناموفق بود.";

      if (
        result.description != null &&
        result.description != ""
      ) {

        errorDescription =
          result.description;

      }

      throw new Error(
        errorDescription
      );

    }

    var messageId = "";

    if (
      result.result != null &&
      result.result.message_id != null
    ) {

      messageId =
        String(
          result.result.message_id
        );

    }

    return {

      ok: true,

      messageId:
        messageId,

      chatId:
        String(chatId)

    };

  } catch (error) {

    console.error(
      "Telegram notification error: " +
      error.message
    );

    return {

      ok: false,

      error:
        error.message

    };

  }

}


/* =========================================================
   Telegram — پیام در انتظار تأیید مشتری
========================================================= */

function sendCustomerBookingPending(
  chatId,
  data
) {

  try {

    if (!chatId) {

      return {
        ok: false
      };

    }


    var botToken =
      PropertiesService
        .getScriptProperties()
        .getProperty(
          PROP_BOT_TOKEN
        );


    if (!botToken) {

      return {
        ok: false
      };

    }


    var text =
      "✅ درخواست شما با موفقیت ثبت شد\n\n" +

      "🔐 کد پیگیری: " +
      data.trackingCode +

      "\n\n💳 فیش و اطلاعات پرداخت شما دریافت شد و درخواستتان در انتظار بررسی ادمین است.\n\n" +

      "⏳ لطفاً تا حداکثر ۳۰ دقیقه منتظر بمانید.\n" +

      "درخواست شما پس از بررسی اطلاعات و تأیید پرداخت، نهایی خواهد شد.\n\n" +

      "🌿 لطفاً تا زمان دریافت پیام تأیید، از ارسال مجدد درخواست خودداری کنید.\n\n" +

      "📌 کد پیگیری خود را نگه دارید.";


    return telegramSendMessage(
      botToken,
      chatId,
      text
    );


  } catch (error) {

    console.error(
      "Customer pending message error: " +
      error.message
    );


    return {

      ok: false,

      error:
        error.message

    };

  }

}


/* =========================================================
   Telegram — پردازش Update
========================================================= */

function handleTelegramUpdate(
  update
) {

  try {

    /* =====================================================
       دکمه‌های Inline
       ===================================================== */

    if (
      update &&
      update.callback_query
    ) {

      return handleTelegramCallback(
        update.callback_query
      );

    }


    /* =====================================================
       پیام‌های معمولی Telegram
       ===================================================== */

    if (
      update &&
      update.message
    ) {

      var message =
        update.message;

      var chatId =
        message.chat &&
        message.chat.id
          ? message.chat.id
          : "";

      var text =
        message.text
          ? String(message.text).trim()
          : "";


      /* ===================================================
         /start
         =================================================== */

      if (
        text === "/start" ||
        text.indexOf("/start ") === 0
      ) {

        var botToken =
          PropertiesService
            .getScriptProperties()
            .getProperty(
              PROP_BOT_TOKEN
            );


        if (!botToken || !chatId) {

          return jsonResponse({

            ok: false,

            error:
              "Telegram Bot Token یا Chat ID پیدا نشد."

          });

        }


        var startText =
          "🌿 به سامانه دریافت نوبت کائنات‌چی خوش آمدید.\n\n" +
          "لطفاً از منوی زیر خدمات کائنات‌چی را مشاهده و نوبت خود را دریافت کنید:";


        var keyboard = {

          inline_keyboard: [

            [
              {
                text:
                  "📋 لیست خدمات",

                callback_data:
                  "services"
              }
            ]

          ]

        };


        var url =
          "https://api.telegram.org/bot" +
          botToken +
          "/sendMessage";


        var response =
          UrlFetchApp.fetch(
            url,
            {

              method:
                "post",

              payload: {

                chat_id:
                  chatId,

                text:
                  startText,

                reply_markup:
                  JSON.stringify(
                    keyboard
                  )

              },

              muteHttpExceptions:
                true

            }
          );


        var result =
          JSON.parse(
            response.getContentText()
          );


        return jsonResponse({

          ok:
            result.ok === true

        });

      }


      /* ===================================================
         سایر پیام‌های متنی
         =================================================== */

      return jsonResponse({

        ok: true

      });

    }


    /* =====================================================
       Update ناشناخته
       ===================================================== */

    return jsonResponse({

      ok: true

    });


  } catch (error) {

    console.error(
      "Telegram update error: " +
      error.message
    );


    return jsonResponse({

      ok: false,

      error:
        error.message

    });

  }

}


/* =========================================================
   Telegram Callback
========================================================= */

function handleTelegramCallback(callback) {

  var callbackData = callback.data;

  if (callbackData == null) {
    callbackData = "";
  }

  var parts = callbackData.split("|");

  if (parts.length < 2) {

    answerTelegramCallback(
      callback.id,
      "اطلاعات دکمه معتبر نیست."
    );

    return jsonResponse({
      ok: false
    });
  }

  var action = parts[0];
  var trackingCode = parts[1];

  if (action != "approve" && action != "reject") {

    answerTelegramCallback(
      callback.id,
      "عملیات معتبر نیست."
    );

    return jsonResponse({
      ok: false
    });
  }

  /*
   * پاسخ سریع به Telegram
   * تا پیام بالای دکمه بلافاصله نمایش داده شود.
   */
  answerTelegramCallback(
    callback.id,
    action == "approve"
      ? "نوبت تأیید شد ✅"
      : "نوبت رد شد ❌"
  );

  var lock =
    LockService.getScriptLock();

  try {

    lock.waitLock(15000);

    var sheetId =
      PropertiesService
        .getScriptProperties()
        .getProperty(
          PROP_SHEET_ID
        );

    if (sheetId == null) {

      throw new Error(
        "BOOKING_SHEET_ID پیدا نشد."
      );
    }

    var ss =
      SpreadsheetApp.openById(
        sheetId
      );

    var sheet =
      getSheetByAliases(
        ss,
        [
          "نوبت‌ها",
          "نوبت ها"
        ]
      );

    if (sheet == null) {

      throw new Error(
        "شیت نوبت‌ها پیدا نشد."
      );
    }

    ensureBookingHeaders(
      sheet
    );

    var booking =
      findBookingByTrackingCode(
        sheet,
        trackingCode
      );

    if (booking == null) {

      return jsonResponse({
        ok: false,
        message: "نوبت پیدا نشد."
      });
    }

    var currentStatus = "";

    if (
      booking.appointmentStatus == null
    ) {

      if (
        booking.status == null
      ) {

        currentStatus = "";

      } else {

        currentStatus =
          booking.status;
      }

    } else {

      currentStatus =
        booking.appointmentStatus;
    }

    currentStatus =
      normalizeText(
        currentStatus
      );

    if (
      currentStatus ===
      normalizeText(
        "تأیید شده"
      )
    ) {

      return jsonResponse({
        ok: true,
        alreadyProcessed: true
      });
    }

    if (
      currentStatus ===
      normalizeText(
        "رد شده"
      )
    ) {

      return jsonResponse({
        ok: true,
        alreadyProcessed: true
      });
    }

    var newStatus = "";

    if (
      action == "approve"
    ) {

      newStatus =
        "تأیید شده";

    } else {

      newStatus =
        "رد شده";
    }

    var paymentStatus = "";

    if (
      action == "approve"
    ) {

      paymentStatus =
        "پرداخت تأیید شد";

    } else {

      paymentStatus =
        "پرداخت رد شد";
    }

    sheet
      .getRange(
        booking.row,
        9
      )
      .setValue(
        newStatus
      );

    sheet
      .getRange(
        booking.row,
        16
      )
      .setValue(
        paymentStatus
      );

    sheet
      .getRange(
        booking.row,
        17
      )
      .setValue(
        newStatus
      );

    sheet
      .getRange(
        booking.row,
        23
      )
      .setValue(
        new Date()
      );

    SpreadsheetApp.flush();

    if (
      booking.telegramChatId != null
    ) {

      if (
        action == "approve"
      ) {

        sendCustomerBookingApproved(
          booking.telegramChatId,
          booking
        );

      } else {

        sendCustomerBookingRejected(
          booking.telegramChatId,
          booking
        );
      }
    }

    Logger.log(
      "BEFORE EDIT ADMIN MESSAGE"
    );

    Logger.log(
      JSON.stringify(
        callback.message
      )
    );

    /*
     * حذف پیام قبلی ادمین
     * و ارسال پیام جدید بدون دکمه.
     */
    editTelegramAdminMessage(
      callback.message,
      booking,
      newStatus
    );

    return jsonResponse({
      ok: true,
      status: newStatus
    });

  } catch (error) {

    console.error(
      "Telegram callback error: " +
      error.message
    );

    return jsonResponse({
      ok: false,
      error: error.message
    });

  } finally {

    try {

      lock.releaseLock();

    } catch (e) {
    }
  }
}

/* =========================================================
   پیدا کردن نوبت با کد پیگیری
========================================================= */

function findBookingByTrackingCode(
  sheet,
  trackingCode
) {

  var values =
    sheet
      .getDataRange()
      .getValues();


  var wanted =
    normalizeText(
      trackingCode
    );


  for (
    var i =
      values.length - 1;
    i >= 1;
    i--
  ) {

    var rowTracking =
      cleanValue(
        values[i][6]
      );


    if (
      normalizeText(
        rowTracking
      ) !== wanted
    ) {

      continue;

    }


    return {

      row:
        i + 1,

      trackingCode:
        rowTracking,

      date:
        cleanValue(
          values[i][1]
        ),

      time:
        normalizeSheetTime(
          values[i][2]
        ),

      firstName:
        cleanValue(
          values[i][3]
        ),

      mobile:
        cleanValue(
          values[i][4]
        ),

      service:
        cleanValue(
          values[i][5]
        ),

      status:
        cleanValue(
          values[i][8]
        ),

      lastName:
        cleanValue(
          values[i][9]
        ),

      finalPrice:
        parseMoney(
          values[i][13]
        ),

      telegramChatId:
        values[i].length > 14
          ? cleanValue(values[i][14])
          : "",

      paymentStatus:
        values[i].length > 15
          ? cleanValue(values[i][15])
          : "",

      appointmentStatus:
        values[i].length > 16
          ? cleanValue(values[i][16])
          : ""

    };

  }


  return null;

}


/* =========================================================
   پیام تأیید مشتری
========================================================= */

function sendCustomerBookingApproved(
  chatId,
  booking
) {

  var botToken =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        PROP_BOT_TOKEN
      );


  if (
    !botToken ||
    !chatId
  ) {

    return;

  }


var displayDate = booking.date;

if (typeof displayDate === "string") {
  var dateMatch = displayDate.match(
    /[A-Za-z]{3}\s+([0-9]{1,2})\s+1405/
  );

  if (dateMatch) {
    var day = String(dateMatch[1]).padStart(2, "0");

    var monthMatch = displayDate.match(
      /[A-Za-z]{3}\s+/
    );

    var monthName = displayDate.substring(
      displayDate.indexOf(" ") + 1,
      displayDate.indexOf(" ") + 4
    );

    var months = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12"
    };

    if (months[monthName]) {
      displayDate =
        "1405/" +
        months[monthName] +
        "/" +
        day;
    }
  }
}

var text =
  "🎉 نوبت شما تأیید شد\n\n" +

  "🔐 کد پیگیری: " +
  booking.trackingCode +

  "\n\n🔮 خدمت: " +
  booking.service +

  "\n📅 تاریخ: " +
  displayDate +

  "\n⏰ ساعت: " +
  booking.time +

  "\n\n💳 پرداخت شما نیز تأیید شد.\n\n" +

  "🌿 نوبت شما با موفقیت نهایی شد.\n" +

  "لطفاً کد پیگیری خود را تا پایان دریافت خدمات نگه دارید.";

  telegramSendMessage(
    botToken,
    chatId,
    text
  );

}


/* =========================================================
   پیام رد مشتری
========================================================= */

function sendCustomerBookingRejected(
  chatId,
  booking
) {

  var botToken =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        PROP_BOT_TOKEN
      );


  if (
    !botToken ||
    !chatId
  ) {

    return;

  }


  var text =
    "❌ درخواست نوبت شما تأیید نشد\n\n" +

    "🔐 کد پیگیری: " +
    booking.trackingCode +

    "\n\n🔮 خدمت: " +
    booking.service +

    "\n📅 تاریخ: " +
    booking.date +

    "\n⏰ ساعت: " +
    booking.time +

    "\n\nدر صورت نیاز، لطفاً برای پیگیری با ادمین کائنات‌چی در ارتباط باشید.";


  telegramSendMessage(
    botToken,
    chatId,
    text
  );

}


/* =========================================================
   Telegram Send
========================================================= */

function telegramSendMessage(
  botToken,
  chatId,
  text
) {

  try {

    var url =
      "https://api.telegram.org/bot" +
      botToken +
      "/sendMessage";


    var response =
      UrlFetchApp.fetch(
        url,
        {

          method:
            "post",

          payload: {

            chat_id:
              chatId,

            text:
              text

          },

          muteHttpExceptions:
            true

        }
      );


    var result =
      JSON.parse(
        response.getContentText()
      );


    return result;


  } catch (error) {

    console.error(
      "Telegram send error: " +
      error.message
    );


    return {

      ok: false,

      error:
        error.message

    };

  }

}


/* =========================================================
   پاسخ Callback تلگرام
========================================================= */

function answerTelegramCallback(
  callbackId,
  text
) {

  try {

    var botToken =
      PropertiesService
        .getScriptProperties()
        .getProperty(
          PROP_BOT_TOKEN
        );


    if (!botToken) {
      return;
    }


    var url =
      "https://api.telegram.org/bot" +
      botToken +
      "/answerCallbackQuery";


    UrlFetchApp.fetch(
      url,
      {

        method:
          "post",

        payload: {

          callback_query_id:
            callbackId,

          text:
            text,

          show_alert:
            false

        },

        muteHttpExceptions:
          true

      }
    );


  } catch (error) {

    console.error(
      "Callback answer error: " +
      error.message
    );

  }

}


/* =========================================================
   ویرایش پیام ادمین
========================================================= */


function editTelegramAdminMessage(message, booking, newStatus) {

  try {

    var sheetId =
      PropertiesService
        .getScriptProperties()
        .getProperty(PROP_SHEET_ID);

    var ss =
      SpreadsheetApp.openById(sheetId);

    var logSheet =
      ss.getSheetByName("لاگ تست");

    if (logSheet == null) {
      logSheet =
        ss.insertSheet("لاگ تست");
    }

    logSheet.appendRow([
      new Date(),
      "EDIT START",
      JSON.stringify(message),
      newStatus
    ]);

    if (message == null) {

      logSheet.appendRow([
        new Date(),
        "MESSAGE NULL",
        "",
        ""
      ]);

      return false;
    }

    var chatId = "";

    if (
      message.chat != null &&
      message.chat.id != null
    ) {
      chatId =
        String(message.chat.id);
    }

    var messageId = "";

    if (message.message_id != null) {
      messageId =
        String(message.message_id);
    }

    logSheet.appendRow([
      new Date(),
      "MESSAGE DATA",
      "chatId=" + chatId,
      "messageId=" + messageId
    ]);

    if (
      chatId == "" ||
      messageId == ""
    ) {

      logSheet.appendRow([
        new Date(),
        "MISSING ID",
        chatId,
        messageId
      ]);

      return false;
    }

    var botToken =
      PropertiesService
        .getScriptProperties()
        .getProperty(PROP_BOT_TOKEN);

    if (
      botToken == null ||
      botToken == ""
    ) {

      logSheet.appendRow([
        new Date(),
        "BOT TOKEN EMPTY",
        "",
        ""
      ]);

      return false;
    }

    logSheet.appendRow([
      new Date(),
      "DELETE START",
      chatId,
      messageId
    ]);

    var deleteUrl =
      "https://api.telegram.org/bot" +
      botToken +
      "/deleteMessage";

    var deleteResponse =
      UrlFetchApp.fetch(
        deleteUrl,
        {
          method: "post",
          payload: {
            chat_id: chatId,
            message_id: messageId
          },
          muteHttpExceptions: true
        }
      );

    var deleteText =
      deleteResponse.getContentText();

    logSheet.appendRow([
      new Date(),
      "DELETE RESPONSE",
      deleteText,
      ""
    ]);

    var deleteResult =
      JSON.parse(deleteText);

    if (deleteResult.ok !== true) {

      logSheet.appendRow([
        new Date(),
        "DELETE FAILED",
        deleteText,
        ""
      ]);

      return false;
    }

    logSheet.appendRow([
      new Date(),
      "DELETE SUCCESS",
      "",
      ""
    ]);

    var firstName = "";
    var lastName = "";
    var mobile = "";
    var service = "";
    var date = "";
    var time = "";
    var trackingCode = "";
    var finalPrice = 0;

    if (booking != null) {

      if (booking.firstName != null) {
        firstName =
          booking.firstName;
      }

      if (booking.lastName != null) {
        lastName =
          booking.lastName;
      }

      if (booking.mobile != null) {
        mobile =
          booking.mobile;
      }

      if (booking.service != null) {
        service =
          booking.service;
      }

      if (booking.date != null) {
        date =
          booking.date;
      }

      if (booking.time != null) {
        time =
          booking.time;
      }

      if (booking.trackingCode != null) {
        trackingCode =
          booking.trackingCode;
      }

      if (booking.finalPrice != null) {
        finalPrice =
          booking.finalPrice;
      }
    }

  if (date != null) {

  date = String(date);

  var dateMatch =
    date.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/);

  if (dateMatch != null) {

    var monthName =
      dateMatch[1];

    var dateDay =
      dateMatch[2];

    var dateYear =
      dateMatch[3];

    var monthNumber =
      "";

    if (monthName == "Jan") {
      monthNumber = "01";
    } else if (monthName == "Feb") {
      monthNumber = "02";
    } else if (monthName == "Mar") {
      monthNumber = "03";
    } else if (monthName == "Apr") {
      monthNumber = "04";
    } else if (monthName == "May") {
      monthNumber = "05";
    } else if (monthName == "Jun") {
      monthNumber = "06";
    } else if (monthName == "Jul") {
      monthNumber = "07";
    } else if (monthName == "Aug") {
      monthNumber = "08";
    } else if (monthName == "Sep") {
      monthNumber = "09";
    } else if (monthName == "Oct") {
      monthNumber = "10";
    } else if (monthName == "Nov") {
      monthNumber = "11";
    } else if (monthName == "Dec") {
      monthNumber = "12";
    }

    if (dateDay.length == 1) {
      dateDay = "0" + dateDay;
    }

    if (monthNumber != "") {

      date =
        dateYear +
        "/" +
        monthNumber +
        "/" +
        dateDay;
    }
  }
}

    var fullName =
      firstName;

    if (lastName != "") {
      fullName =
        fullName + " " + lastName;
    }

    var text =
"🌿 نوبت کائنات‌چی\n\n" +
      "👤 نام: " +
      fullName +
      "\n📱 موبایل: " +
      mobile +
      "\n🔮 خدمت: " +
      service +
      "\n📅 تاریخ: " +
      date +
      "\n⏰ ساعت: " +
      time +
      "\n🎫 کد پیگیری: " +
      trackingCode +
      "\n💳 مبلغ نهایی: " +
      formatMoney(finalPrice) +
      " تومان" +
      "\n\n📌 وضعیت: " +
      newStatus;

    logSheet.appendRow([
      new Date(),
      "SEND START",
      text,
      ""
    ]);

    var sendUrl =
      "https://api.telegram.org/bot" +
      botToken +
      "/sendMessage";

    var sendResponse =
      UrlFetchApp.fetch(
        sendUrl,
        {
          method: "post",
          payload: {
            chat_id: chatId,
            text: text
          },
          muteHttpExceptions: true
        }
      );

    var sendText =
      sendResponse.getContentText();

    logSheet.appendRow([
      new Date(),
      "SEND RESPONSE",
      sendText,
      ""
    ]);

    var sendResult =
      JSON.parse(sendText);

    if (sendResult.ok !== true) {

      logSheet.appendRow([
        new Date(),
        "SEND FAILED",
        sendText,
        ""
      ]);

      return false;
    }

    logSheet.appendRow([
      new Date(),
      "EDIT SUCCESS",
      "",
      ""
    ]);

    return true;

  } catch (error) {

    try {

      var sheetId =
        PropertiesService
          .getScriptProperties()
          .getProperty(PROP_SHEET_ID);

      var ss =
        SpreadsheetApp.openById(sheetId);

      var logSheet =
        ss.getSheetByName("لاگ تست");

      if (logSheet == null) {
        logSheet =
          ss.insertSheet("لاگ تست");
      }

      logSheet.appendRow([
        new Date(),
        "ERROR",
        error.message,
        ""
      ]);

    } catch (logError) {
    }

    return false;
  }
}


/* =========================================================
   تست Telegram
========================================================= */

function testTelegram() {

  var props =
    PropertiesService
      .getScriptProperties();


  var botToken =
    props.getProperty(
      PROP_BOT_TOKEN
    );


  var chatId =
    props.getProperty(
      PROP_CHAT_ID
    );


  if (
    !botToken ||
    !chatId
  ) {

    throw new Error(
      "TELEGRAM_BOT_TOKEN یا TELEGRAM_CHAT_ID پیدا نشد."
    );

  }


  var result =
    telegramSendMessage(
      botToken,
      chatId,
      "🧪 تست اتصال کائنات‌چی\n\nGoogle Apps Script به تلگرام متصل است ✅"
    );


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

}


/* =========================================================
   تنظیمات
========================================================= */

function getSetting(
  ss,
  names
) {

  if (!ss) {
    return "";
  }


  if (
    !Array.isArray(names)
  ) {

    names =
      [names];

  }


  var sheet =
    getSheetByAliases(
      ss,
      [
        "تنظیمات"
      ]
    );


  if (!sheet) {
    return "";
  }


  var values =
    sheet
      .getDataRange()
      .getValues();


  for (
    var i = 1;
    i < values.length;
    i++
  ) {

    var name =
      cleanValue(
        values[i][0]
      );


    for (
      var j = 0;
      j < names.length;
      j++
    ) {

      if (
        normalizeText(name) ===
        normalizeText(names[j])
      ) {

        return cleanValue(
          values[i][1]
        );

      }

    }

  }


  return "";

}


function getNumberSetting(
  ss,
  names,
  fallback
) {

  var value =
    getSetting(
      ss,
      names
    );


  var number =
    parseMoney(
      value
    );


  return number > 0
    ? number
    : fallback;

}


function getDefaultDuration(
  ss
) {

  return getNumberSetting(
    ss,
    [
      "مدت هر نوبت"
    ],
    30
  );

}


/* =========================================================
   ابزار شیت
========================================================= */

function getSheetByAliases(
  ss,
  aliases
) {

  if (!ss) {
    return null;
  }


  var sheets =
    ss.getSheets();


  for (
    var i = 0;
    i < sheets.length;
    i++
  ) {

    var actualName =
      sheets[i].getName();


    for (
      var j = 0;
      j < aliases.length;
      j++
    ) {

      if (
        normalizeSheetName(
          actualName
        ) ===
        normalizeSheetName(
          aliases[j]
        )
      ) {

        return sheets[i];

      }

    }

  }


  return null;

}


function normalizeSheetName(
  value
) {

  return String(
    value || ""
  )
    .trim()
    .replace(
      /ي/g,
      "ی"
    )
    .replace(
      /ى/g,
      "ی"
    )
    .replace(
      /ك/g,
      "ک"
    )
    .replace(
      /[\s\u200c\u200d]+/g,
      ""
    );

}


/* =========================================================
   پول
========================================================= */

function parseMoney(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return 0;

  }


  var text =
    String(
      value
    );


  text =
    toEnglishDigits(
      text
    )
      .replace(
        /,/g,
        ""
      )
      .replace(
        /٬/g,
        ""
      )
      .replace(
        /٫/g,
        "."
      );


  var result =
    Number(
      text
    );


  return isNaN(result)
    ? 0
    : result;

}


function formatMoney(
  value
) {

  return Number(
    value || 0
  ).toLocaleString(
    "en-US"
  );

}


/* =========================================================
   متن
========================================================= */

function cleanValue(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }


  return String(
    value
  ).trim();

}


function normalizeText(
  value
) {

  return toEnglishDigits(
    String(
      value || ""
    )
  )
    .trim()
    .replace(
      /ي/g,
      "ی"
    )
    .replace(
      /ى/g,
      "ی"
    )
    .replace(
      /ك/g,
      "ک"
    )
    .replace(
      /\u200c/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

}


function normalizeLooseText(
  value
) {

  return normalizeText(
    value
  )
    .replace(
      /\s+/g,
      ""
    );

}


function isYesValue(
  value
) {

  var text =
    normalizeLooseText(
      value
    );


  return (
    text === "بله" ||
    text === "فعال" ||
    text === "دارد" ||
    text === "الزامی"
  );

}


function toEnglishDigits(
  value
) {

  return String(
    value || ""
  )
    .replace(
      /۰/g,
      "0"
    )
    .replace(
      /۱/g,
      "1"
    )
    .replace(
      /۲/g,
      "2"
    )
    .replace(
      /۳/g,
      "3"
    )
    .replace(
      /۴/g,
      "4"
    )
    .replace(
      /۵/g,
      "5"
    )
    .replace(
      /۶/g,
      "6"
    )
    .replace(
      /۷/g,
      "7"
    )
    .replace(
      /۸/g,
      "8"
    )
    .replace(
      /۹/g,
      "9"
    );

}


/* =========================================================
   Slot Key
========================================================= */

function makeSlotKey(
  date,
  time
) {

  return (
    normalizeLooseText(
      date
    ) +
    "|" +
    normalizeText(
      normalizeSheetTime(
        time
      )
    )
  );

}


/* =========================================================
   کد پیگیری
========================================================= */

function createUniqueTrackingCode(
  sheet
) {

  for (
    var attempt = 0;
    attempt < 20;
    attempt++
  ) {

    var code =
      "KC-" +
      String(
        new Date().getTime()
      ).slice(-8) +
      String(
        Math.floor(
          Math.random() * 90
        ) + 10
      );


    if (
      !findBookingByTrackingCode(
        sheet,
        code
      )
    ) {

      return code;

    }

  }


  return (
    "KC-" +
    Utilities.getUuid()
      .replace(
        /-/g,
        ""
      )
      .slice(
        0,
        10
      )
      .toUpperCase()
  );

}


/* =========================================================
   Request ID
========================================================= */

function createRequestId() {

  return (
    "REQ-" +
    Utilities.getUuid()
      .replace(
        /-/g,
        ""
      )
      .slice(
        0,
        20
      )
      .toUpperCase()
  );

}


/* =========================================================
   Headerهای جدید
========================================================= */

function ensureBookingHeaders(
  sheet
) {

  if (!sheet) {
    return;
  }


  var requiredHeaders = [

    "زمان ثبت",
    "تاریخ",
    "ساعت",
    "نام",
    "موبایل",
    "خدمت",
    "کد پیگیری",
    "کلید نوبت",
    "وضعیت",
    "نام خانوادگی",
    "کد تخفیف",
    "مبلغ اصلی",
    "مبلغ تخفیف",
    "مبلغ نهایی",
    "شناسه تلگرام",
    "وضعیت پرداخت",
    "وضعیت نوبت",
    "لینک فیش",
    "وضعیت مشاوره",
    "متن رسید بانکی",
    "شماره تراکنش",
    "شناسه درخواست",
    "زمان تأیید",
    "یادداشت ادمین"

  ];


  var currentLastColumn =
    Math.max(
      sheet.getLastColumn(),
      1
    );


  var headers =
    sheet
      .getRange(
        1,
        1,
        1,
        currentLastColumn
      )
      .getValues()[0];


  if (
    !headers[0]
  ) {

    sheet
      .getRange(
        1,
        1,
        1,
        requiredHeaders.length
      )
      .setValues([
        requiredHeaders
      ]);


    return;

  }


  for (
    var i = 0;
    i < requiredHeaders.length;
    i++
  ) {

    var expected =
      requiredHeaders[i];


    var existing =
      i < headers.length
        ? cleanValue(
            headers[i]
          )
        : "";


    if (!existing) {

      sheet
        .getRange(
          1,
          i + 1
        )
        .setValue(
          expected
        );

    }

  }

}


/* =========================================================
   Telegram User ID
========================================================= */

function getTelegramUserIdFromInitData(
  initData
) {

  if (!initData) {
    return "";
  }


  try {

    var params = {};


    initData
      .split("&")
      .forEach(
        function(pair) {

          var parts =
            pair.split("=");


          if (
            parts.length >= 2
          ) {

            params[
              decodeURIComponent(
                parts[0]
              )
            ] =
              decodeURIComponent(
                parts
                  .slice(1)
                  .join("=")
              );

          }

        }
      );


    if (!params.user) {
      return "";
    }


    var user =
      JSON.parse(
        params.user
      );


    return user.id
      ? String(
          user.id
        )
      : "";


  } catch (error) {

    console.error(
      "Telegram user parsing error: " +
      error.message
    );


    return "";

  }

}


/* =========================================================
   JSON
========================================================= */

function jsonResponse(
  data
) {

  return ContentService
    .createTextOutput(
      JSON.stringify(
        data
      )
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );

}


/* =========================================================
   تست Public Config
========================================================= */

function testPublicConfig() {

  var result =
    getPublicConfig();


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

}


/* =========================================================
   تست Booking Validation
========================================================= */

function testBookingValidation() {

  var sheetId =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        PROP_SHEET_ID
      );


  if (!sheetId) {

    throw new Error(
      "BOOKING_SHEET_ID پیدا نشد."
    );

  }


  var ss =
    SpreadsheetApp.openById(
      sheetId
    );


  var tests = [

    {

      title:
        "رزرو روی نوبت موجود 11:00",

      date:
        "پنج‌شنبه 9 مهر",

      time:
        "11:00",

      duration:
        30

    },

    {

      title:
        "رزرو روی نوبت موجود 11:30",

      date:
        "پنج‌شنبه 9 مهر",

      time:
        "11:30",

      duration:
        30

    },

    {

      title:
        "رزرو ساعت آزاد 12:00",

      date:
        "پنج‌شنبه 9 مهر",

      time:
        "12:00",

      duration:
        30

    },

    {

      title:
        "رزرو ساعت آزاد 13:00",

      date:
        "چهارشنبه 8 مهر",

      time:
        "13:00",

      duration:
        30

    }

  ];


  var result = [];


  var sheet =
    getSheetByAliases(
      ss,
      [
        "نوبت‌ها",
        "نوبت ها"
      ]
    );


  if (!sheet) {

    throw new Error(
      "شیت نوبت‌ها پیدا نشد."
    );

  }


  var values =
    sheet
      .getDataRange()
      .getValues();


  tests.forEach(
    function(test) {

      var conflict =
        false;


      var conflictWith =
        "";


      for (
        var i = 1;
        i < values.length;
        i++
      ) {

        var existingDate =
          cleanValue(
            values[i][1]
          );


        var existingTime =
          normalizeSheetTime(
            values[i][2]
          );


        if (
          !existingDate ||
          !existingTime
        ) {

          continue;

        }


        var legacyStatus =
          cleanValue(
            values[i][8]
          );


        var appointmentStatus =
          values[i].length > 16
            ? cleanValue(values[i][16])
            : "";


        if (
          !isReservedStatus(
            legacyStatus,
            appointmentStatus
          )
        ) {

          continue;

        }


        var existingService =
          cleanValue(
            values[i][5]
          );


        var existingServiceInfo =
          getServiceInfo(
            ss,
            existingService
          );


        var existingDuration =
          existingServiceInfo &&
          existingServiceInfo.duration
            ? existingServiceInfo.duration
            : getDefaultDuration(
                ss
              );


        if (
          slotsOverlap(
            test.date,
            test.time,
            test.duration,
            existingDate,
            existingTime,
            existingDuration
          )
        ) {

          conflict =
            true;


          conflictWith =
            existingDate +
            " | " +
            existingTime +
            " | " +
            existingService;


          break;

        }

      }


      result.push({

        title:
          test.title,

        date:
          test.date,

        time:
          test.time,

        conflict:
          conflict,

        conflictWith:
          conflictWith,

        available:
          !conflict

      });

    }
  );


  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}

function testRow11() {
  var ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty("BOOKING_SHEET_ID")
  );
  var sheet = ss.getSheetByName("نوبت‌ها");

  var row = sheet.getRange(11, 1, 1, 24).getValues()[0];

  Logger.log(JSON.stringify({
    A: row[0],
    B: row[1],
    C: row[2],
    I: row[8],
    Q: row[16]
  }));
}

function testRow11Display() {
  var ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty("BOOKING_SHEET_ID")
  );
  var sheet = ss.getSheetByName("نوبت‌ها");

  var row = sheet.getRange(11, 1, 1, 24).getDisplayValues()[0];

  Logger.log(JSON.stringify({
    A: row[0],
    B: row[1],
    C: row[2],
    I: row[8],
    Q: row[16]
  }));
}

function telegramResponse(data) {
  return HtmlService.createHtmlOutput(
    JSON.stringify(data || { ok: true })
  );
}
function testTelegramAdminEdit() {
  var props =
    PropertiesService.getScriptProperties();

  var botToken =
    props.getProperty(PROP_BOT_TOKEN);

  var chatId =
    props.getProperty(PROP_CHAT_ID);

  if (botToken == null || botToken == "") {
    throw new Error("TELEGRAM_BOT_TOKEN پیدا نشد.");
  }

  if (chatId == null || chatId == "") {
    throw new Error("TELEGRAM_CHAT_ID پیدا نشد.");
  }

  var url =
    "https://api.telegram.org/bot" +
    botToken +
    "/sendMessage";

  var response =
    UrlFetchApp.fetch(
      url,
      {
        method: "post",
        payload: {
          chat_id: chatId,
          text:
            "🧪 تست ارتباط کائنات‌چی\n\n" +
            "اگر این پیام را می‌بینی، اتصال ربات به Telegram برقرار است."
        },
        muteHttpExceptions: true
      }
    );

  Logger.log(
    response.getContentText()
  );
}

function testTelegramDelete() {
  var props =
    PropertiesService.getScriptProperties();

  var botToken =
    props.getProperty(PROP_BOT_TOKEN);

  var chatId =
    props.getProperty(PROP_CHAT_ID);

  var messageId = "692";

  var url =
    "https://api.telegram.org/bot" +
    botToken +
    "/deleteMessage";

  var response =
    UrlFetchApp.fetch(
      url,
      {
        method: "post",
        payload: {
          chat_id: chatId,
          message_id: messageId
        },
        muteHttpExceptions: true
      }
    );

  Logger.log(
    response.getContentText()
  );
}

function testTelegramDeleteAndSend() {
  var props =
    PropertiesService.getScriptProperties();

  var botToken =
    props.getProperty(PROP_BOT_TOKEN);

  var chatId =
    props.getProperty(PROP_CHAT_ID);

  var sendUrl =
    "https://api.telegram.org/bot" +
    botToken +
    "/sendMessage";

  var sendResponse =
    UrlFetchApp.fetch(
      sendUrl,
      {
        method: "post",
        payload: {
          chat_id: chatId,
          text:
            "🧪 پیام تست ویرایش ادمین\n\n" +
            "⏳ وضعیت: در انتظار تأیید"
        },
        muteHttpExceptions: true
      }
    );

  var sendText =
    sendResponse.getContentText();

  Logger.log(
    "SEND: " +
    sendText
  );

  var sendResult =
    JSON.parse(sendText);

  if (
    sendResult.ok !== true ||
    sendResult.result == null ||
    sendResult.result.message_id == null
  ) {
    throw new Error(
      "ساخت پیام تست ناموفق بود."
    );
  }

  var messageId =
    sendResult.result.message_id;

  var deleteUrl =
    "https://api.telegram.org/bot" +
    botToken +
    "/deleteMessage";

  var deleteResponse =
    UrlFetchApp.fetch(
      deleteUrl,
      {
        method: "post",
        payload: {
          chat_id: chatId,
          message_id: messageId
        },
        muteHttpExceptions: true
      }
    );

  Logger.log(
    "DELETE: " +
    deleteResponse.getContentText()
  );

  var newSendResponse =
    UrlFetchApp.fetch(
      sendUrl,
      {
        method: "post",
        payload: {
          chat_id: chatId,
          text:
            "🌿 نوبت کائنات‌چی\n\n" +
            "📌 وضعیت: تأیید شده"
        },
        muteHttpExceptions: true
      }
    );

  Logger.log(
    "NEW MESSAGE: " +
    newSendResponse.getContentText()
  );
}

function processAppointmentReminders() {

  try {

    var sheetId =
      PropertiesService
        .getScriptProperties()
        .getProperty(PROP_SHEET_ID);

    if (
      sheetId == null ||
      sheetId == ""
    ) {
      throw new Error(
        "BOOKING_SHEET_ID پیدا نشد."
      );
    }

    var ss =
      SpreadsheetApp.openById(sheetId);

    var sheet =
      getSheetByAliases(
        ss,
        [
          "نوبت‌ها",
          "نوبت ها"
        ]
      );

    if (sheet == null) {
      throw new Error(
        "شیت نوبت‌ها پیدا نشد."
      );
    }

    var reminderSheet =
      ss.getSheetByName(
        "یادآوری‌ها"
      );

    if (reminderSheet == null) {

      reminderSheet =
        ss.insertSheet(
          "یادآوری‌ها"
        );

      reminderSheet.appendRow([
        "زمان ارسال",
        "کد پیگیری",
        "نوع یادآوری"
      ]);
    }

    var values =
      sheet.getDataRange()
        .getValues();

    if (values.length < 2) {
      return;
    }

    var now =
      new Date();

    for (
      var i = 1;
      i < values.length;
      i++
    ) {

      var row =
        values[i];

      var appointmentDate =
        row[1];

      var appointmentTime =
        row[2];

      var trackingCode =
        row[6];

      var telegramChatId =
        row[14];

      var paymentStatus =
        row[15];

      var appointmentStatus =
        row[16];

      if (
        trackingCode == null ||
        trackingCode == ""
      ) {
        continue;
      }

      if (
        telegramChatId == null ||
        telegramChatId == ""
      ) {
        continue;
      }

      if (
        normalizeText(
          appointmentStatus
        ) !=
        normalizeText(
          "تأیید شده"
        )
      ) {
        continue;
      }

      var appointmentDateTime =
        buildReminderDateTime(
          appointmentDate,
          appointmentTime
        );

      if (
        appointmentDateTime == null
      ) {
        continue;
      }

      var difference =
        appointmentDateTime.getTime() -
        now.getTime();

      var reminderType =
        "";

      if (
        difference >=
        23 * 60 * 60 * 1000 &&
        difference <=
        25 * 60 * 60 * 1000
      ) {

        reminderType =
          "24 ساعت";

      } else if (
        difference >=
        30 * 60 * 1000 &&
        difference <=
        90 * 60 * 1000
      ) {

        reminderType =
          "1 ساعت";
      }

      if (
        reminderType == ""
      ) {
        continue;
      }

      if (
        reminderAlreadySent(
          reminderSheet,
          trackingCode,
          reminderType
        )
      ) {
        continue;
      }

      var dateText =
        formatReminderDate(
          appointmentDate
        );

      var message =
        "🔔 یادآوری نوبت کائنات‌چی\n\n" +
        "🌿 دوست عزیز، یادآوری نوبت شما\n\n" +
        "🔮 خدمت: " +
        row[5] +
        "\n📅 تاریخ: " +
        dateText +
        "\n⏰ ساعت: " +
        appointmentTime +
        "\n🎫 کد پیگیری: " +
        trackingCode;

      sendTelegramReminder(
        telegramChatId,
        message
      );

      reminderSheet.appendRow([
        new Date(),
        trackingCode,
        reminderType
      ]);
    }

  } catch (error) {

    console.error(
      "Reminder error: " +
      error.message
    );
  }
}


function reminderAlreadySent(
  sheet,
  trackingCode,
  reminderType
) {

  var values =
    sheet.getDataRange()
      .getValues();

  for (
    var i = 1;
    i < values.length;
    i++
  ) {

    if (
      String(values[i][1]) ==
      String(trackingCode) &&
      String(values[i][2]) ==
      String(reminderType)
    ) {
      return true;
    }
  }

  return false;
}


function sendTelegramReminder(
  chatId,
  message
) {

  var botToken =
    PropertiesService
      .getScriptProperties()
      .getProperty(PROP_BOT_TOKEN);

  if (
    botToken == null ||
    botToken == ""
  ) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN پیدا نشد."
    );
  }

  var url =
    "https://api.telegram.org/bot" +
    botToken +
    "/sendMessage";

  var response =
    UrlFetchApp.fetch(
      url,
      {
        method: "post",
        payload: {
          chat_id: String(chatId),
          text: message
        },
        muteHttpExceptions: true
      }
    );

  var result =
    JSON.parse(
      response.getContentText()
    );

  if (
    result.ok !== true
  ) {
    throw new Error(
      result.description ||
      "ارسال یادآوری ناموفق بود."
    );
  }
}


function formatReminderDate(
  value
) {

  if (value == null) {
    return "";
  }

  var text =
    String(value);

  var match =
    text.match(
      /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Za-z]{3}\s+(\d{1,2})\s+(\d{4})/
    );

  if (match != null) {

    var day =
      match[1];

    var year =
      match[2];

    var month =
      "";

    if (text.indexOf("Jan") >= 0) {
      month = "01";
    } else if (text.indexOf("Feb") >= 0) {
      month = "02";
    } else if (text.indexOf("Mar") >= 0) {
      month = "03";
    } else if (text.indexOf("Apr") >= 0) {
      month = "04";
    } else if (text.indexOf("May") >= 0) {
      month = "05";
    } else if (text.indexOf("Jun") >= 0) {
      month = "06";
    } else if (text.indexOf("Jul") >= 0) {
      month = "07";
    } else if (text.indexOf("Aug") >= 0) {
      month = "08";
    } else if (text.indexOf("Sep") >= 0) {
      month = "09";
    } else if (text.indexOf("Oct") >= 0) {
      month = "10";
    } else if (text.indexOf("Nov") >= 0) {
      month = "11";
    } else if (text.indexOf("Dec") >= 0) {
      month = "12";
    }

    if (month != "") {

      if (day.length == 1) {
        day = "0" + day;
      }

      return (
        year +
        "/" +
        month +
        "/" +
        day
      );
    }
  }

  if (
    text.match(
      /^\d{4}\/\d{2}\/\d{2}$/
    )
  ) {
    return text;
  }

  return text;
}


function buildReminderDateTime(
  dateValue,
  timeValue
) {

  if (
    dateValue == null ||
    timeValue == null
  ) {
    return null;
  }

  var dateText =
    formatReminderDate(
      dateValue
    );

  var dateMatch =
    dateText.match(
      /^(\d{4})\/(\d{2})\/(\d{2})$/
    );

  if (dateMatch == null) {
    return null;
  }

  var year =
    Number(dateMatch[1]);

  var month =
    Number(dateMatch[2]);

  var day =
    Number(dateMatch[3]);

  var timeText =
    String(timeValue);

  var timeMatch =
    timeText.match(
      /^(\d{1,2}):(\d{2})/
    );

  if (timeMatch == null) {
    return null;
  }

  var hour =
    Number(timeMatch[1]);

  var minute =
    Number(timeMatch[2]);

  var gregorian =
    jalaliToGregorian(
      year,
      month,
      day
    );

  if (gregorian == null) {
    return null;
  }

  var result =
    new Date(
      Date.UTC(
        gregorian[0],
        gregorian[1] - 1,
        gregorian[2],
        hour - 3,
        minute - 30
      )
    );

  return result;
}


function jalaliToGregorian(
  jy,
  jm,
  jd
) {

  var gy =
    jy <= 979
      ? 621
      : 1600;

  var jy2 =
    jy <= 979
      ? jy - 979
      : jy - 979;

  var days =
    365 * jy2 +
    Math.floor(jy2 / 33) * 8 +
    Math.floor(
      (jy2 % 33 + 3) / 4
    );

  var i;

  if (jm <= 6) {
    days +=
      (jm - 1) * 31;
  } else {
    days +=
      (jm - 7) * 30 + 186;
  }

  days +=
    jd - 1;

  var gregorianDays =
    days + 79;

  gy +=
    400 *
    Math.floor(
      gregorianDays / 146097
    );

  gregorianDays =
    gregorianDays % 146097;

  var leap =
    true;

  if (
    gregorianDays >= 36525
  ) {

    gregorianDays--;

    gy +=
      100 *
      Math.floor(
        gregorianDays / 36524
      );

    gregorianDays =
      gregorianDays % 36524;

    if (
      gregorianDays >= 365
    ) {
      gregorianDays++;
    } else {
      leap = false;
    }
  }

  gy +=
    4 *
    Math.floor(
      gregorianDays / 1461
    );

  gregorianDays =
    gregorianDays % 1461;

  if (
    gregorianDays >= 366
  ) {

    leap = false;

    gregorianDays--;

    gy +=
      Math.floor(
        gregorianDays / 365
      );

    gregorianDays =
      gregorianDays % 365;
  }

  var gd =
    gregorianDays + 1;

  var monthDays = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  var gm = 0;

  for (
    i = 0;
    i < 12;
    i++
  ) {

    if (
      gd <= monthDays[i]
    ) {
      gm = i + 1;
      break;
    }

    gd -=
      monthDays[i];
  }

  return [
    gy,
    gm,
    gd
  ];
}


/* =========================================================
   پنل مرکزی | مدیریت تعطیلی‌ها
========================================================= */

function handleCentralAdminAction(data) {
  var action = cleanValue(data.central_admin_action || "");

  if (action === "addClosure") {
    return jsonResponse(addAdminClosure(data));
  }

  if (action === "toggleClosure") {
    return jsonResponse(toggleAdminClosure(data.row));
  }

  if (action === "deleteClosure") {
    return jsonResponse(deleteAdminClosure(data.row));
  }

  return jsonResponse({
    ok: false,
    success: false,
    message: "عملیات مدیریتی نامعتبر است."
  });
}

function getAdminClosures() {
  var ss = getBookingSpreadsheetForAdmin_();
  var sheet = getClosureSheetForAdmin_(ss, false);

  if (!sheet) {
    return { ok: true, rows: [] };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { ok: true, rows: [] };
  }

  var values = sheet.getRange(2, 1, lastRow - 1, Math.max(6, sheet.getLastColumn())).getDisplayValues();
  var rows = [];

  for (var i = 0; i < values.length; i++) {
    rows.push({
      row: i + 2,
      startDate: cleanValue(values[i][0]),
      startTime: normalizeSheetTime(values[i][1]) || "00:00",
      endDate: cleanValue(values[i][2]),
      endTime: normalizeSheetTime(values[i][3]) || "23:59",
      active: normalizeText(values[i][4]) === normalizeText("فعال"),
      reason: values[i][5] || ""
    });
  }

  return { ok: true, rows: rows };
}

function addAdminClosure(data) {
  var startDate = normalizeJalaliDateAdmin_(data.startDate);
  var endDate = normalizeJalaliDateAdmin_(data.endDate);
  var startTime = normalizeAdminTime_(data.startTime || "00:00");
  var endTime = normalizeAdminTime_(data.endTime || "23:59");
  var reason = cleanValue(data.reason || "");

  if (!isValidJalaliDateAdmin_(startDate) || !isValidJalaliDateAdmin_(endDate)) {
    return { ok: false, success: false, message: "تاریخ شمسی را به شکل ۱۴۰۵/۰۷/۱۵ وارد کنید." };
  }

  if (dateTimeKey(startDate, startTime) === null || dateTimeKey(endDate, endTime) === null) {
    return { ok: false, success: false, message: "تاریخ یا ساعت تعطیلی معتبر نیست." };
  }

  if (dateTimeKey(endDate, endTime) <= dateTimeKey(startDate, startTime)) {
    return { ok: false, success: false, message: "تاریخ/ساعت پایان باید بعد از شروع باشد." };
  }

  var ss = getBookingSpreadsheetForAdmin_();
  var sheet = getClosureSheetForAdmin_(ss, true);
  sheet.appendRow([startDate, startTime, endDate, endTime, "فعال", reason]);

  return { ok: true, success: true, message: "تعطیلی با موفقیت ثبت شد." };
}

function toggleAdminClosure(rowNumber) {
  var ss = getBookingSpreadsheetForAdmin_();
  var sheet = getClosureSheetForAdmin_(ss, false);
  if (!sheet || !rowNumber || Number(rowNumber) < 2 || Number(rowNumber) > sheet.getLastRow()) {
    return { ok: false, success: false, message: "ردیف تعطیلی معتبر نیست." };
  }

  var cell = sheet.getRange(Number(rowNumber), 5);
  var active = normalizeText(cell.getDisplayValue()) === normalizeText("فعال");
  cell.setValue(active ? "غیرفعال" : "فعال");

  return { ok: true, success: true, active: !active };
}

function deleteAdminClosure(rowNumber) {
  var ss = getBookingSpreadsheetForAdmin_();
  var sheet = getClosureSheetForAdmin_(ss, false);
  if (!sheet || !rowNumber || Number(rowNumber) < 2 || Number(rowNumber) > sheet.getLastRow()) {
    return { ok: false, success: false, message: "ردیف تعطیلی معتبر نیست." };
  }

  sheet.deleteRow(Number(rowNumber));
  return { ok: true, success: true, message: "تعطیلی حذف شد." };
}

function getBookingSpreadsheetForAdmin_() {
  var sheetId = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
  if (!sheetId) throw new Error("BOOKING_SHEET_ID پیدا نشد.");
  return SpreadsheetApp.openById(sheetId);
}

function getClosureSheetForAdmin_(ss, createIfMissing) {
  var sheet = getSheetByAliases(ss, ["تعطیلی ها", "تعطیلی‌ها"]);
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet("تعطیلی‌ها");
    sheet.getRange(1, 1, 1, 6).setValues([["از تاریخ", "از ساعت", "تا تاریخ", "تا ساعت", "وضعیت", "دلیل"]]);
  }
  return sheet;
}

function normalizeJalaliDateAdmin_(value) {
  var text = toEnglishDigits(cleanValue(value || ""));
  text = text.replace(/[-.]/g, "/").replace(/\s+/g, "");
  var m = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return "";
  return m[1] + "/" + pad2(Number(m[2])) + "/" + pad2(Number(m[3]));
}

function isValidJalaliDateAdmin_(value) {
  var m = String(value || "").match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!m) return false;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  if (mo > 6 && d > 30) return false;
  return true;
}

function normalizeAdminTime_(value) {
  var text = toEnglishDigits(cleanValue(value || ""));
  var m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  var h = Number(m[1]), min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return "";
  return pad2(h) + ":" + pad2(min);
}
