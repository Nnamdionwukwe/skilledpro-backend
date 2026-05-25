# SkilledProz Admin — Backend Audit & Build Roadmap

> Generated: 5/25/2026, 12:58:41 AM  |  Project: **skilledpro-backend** v1.0.0

> Backend root: `/Users/onwukwennamdi/Desktop/skilledpro-backend`

---

## 1. Backend Stack

| Concern | Library |
| --- | --- |
| Runtime | Express.js |
| ORM | Prisma |
| Auth | JWT |
| Payments | Stripe |
| File Upload | Multer |
| Email | Nodemailer |
| Realtime | Socket.io |
| Cache | ? |

## 2. Database Models (Prisma Schema)

**24 models** | **16 enums**


| Model | Key Fields | Enum Values / Notes |
| --- | --- | --- |
| **User** | `email`, `phone`, `password`, `role`, `firstName`, `lastName` | HIRER, WORKER, ADMIN |
| **WorkerProfile** | `userId`, `user`, `title`, `description`, `hourlyRate`, `currency` | UNVERIFIED, PENDING, VERIFIED, REJECTED |
| **HirerProfile** | `userId`, `user`, `companyName`, `companySize`, `website`, `totalSpent` | — |
| **Category** | `name`, `slug`, `description`, `icon`, `parentId`, `parent` | — |
| **WorkerCategory** | `workerProfileId`, `workerProfile`, `categoryId`, `category`, `isPrimary` | — |
| **Portfolio** | `workerProfileId`, `workerProfile`, `title`, `description`, `imageUrl` | — |
| **Certification** | `workerProfileId`, `workerProfile`, `name`, `issuedBy`, `issueDate`, `expiryDate` | — |
| **Availability** | `workerProfileId`, `workerProfile`, `dayOfWeek`, `startTime`, `endTime`, `isAvailable` | — |
| **Booking** | `hirerId`, `hirer`, `workerId`, `worker`, `categoryId`, `category` | PENDING, ACCEPTED, REJECTED, IN_PROGRESS, COMPLETED, CANCELLED, DISPUTED |
| **Payment** | `bookingId`, `booking`, `userId`, `user`, `amount`, `currency` | PENDING, HELD, RELEASED, REFUNDED, FAILED |
| **Withdrawal** | `workerId`, `worker`, `amount`, `currency`, `method`, `destination` | PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED |
| **Review** | `bookingId`, `booking`, `giverId`, `giver`, `receiverId`, `receiver` | — |
| **Conversation** | `bookingId`, `booking`, `users`, `messages` | — |
| **ConversationUser** | `conversationId`, `conversation`, `userId`, `user` | — |
| **Message** | `conversationId`, `conversation`, `senderId`, `sender`, `receiverId`, `receiver` | — |
| **Notification** | `userId`, `user`, `title`, `body`, `type`, `data` | — |
| **JobPost** | `hirerId`, `categoryId`, `title`, `description`, `address`, `latitude` | OPEN, FILLED, CANCELLED |
| **Subscription** | `userId`, `user`, `tier`, `role`, `status`, `price` | FREE, PRO, ENTERPRISE |
| **FeaturedListing** | `userId`, `user`, `categoryId`, `category`, `type`, `price` | — |
| **Post** | `authorId`, `author`, `content`, `images`, `type`, `isPublic` | GENERAL, JOB_UPDATE, ACHIEVEMENT, PORTFOLIO, ANNOUNCEMENT, HIRING |
| **PostReaction** | `postId`, `post`, `userId`, `user`, `type` | LIKE, LOVE, INSIGHTFUL, CELEBRATE, SUPPORT |
| **PostComment** | `postId`, `post`, `authorId`, `author`, `content`, `parentId` | — |
| **JobApplication** | `jobPostId`, `workerId`, `message`, `status`, `jobPost`, `worker` | PENDING, ACCEPTED, REJECTED |
| **VideoCall** | `bookingId`, `booking`, `initiatorId`, `initiator`, `receiverId`, `receiver` | — |

### Enums

- `Role`: HIRER | WORKER | ADMIN
- `BookingStatus`: PENDING | ACCEPTED | REJECTED | IN_PROGRESS | COMPLETED | CANCELLED | DISPUTED
- `PaymentStatus`: PENDING | HELD | RELEASED | REFUNDED | FAILED
- `VerificationStatus`: UNVERIFIED | PENDING | VERIFIED | REJECTED
- `JobPostStatus`: OPEN | FILLED | CANCELLED
- `ApplicationStatus`: PENDING | ACCEPTED | REJECTED
- `WithdrawalStatus`: PENDING | PROCESSING | COMPLETED | FAILED | CANCELLED
- `SubscriptionTier`: FREE | PRO | ENTERPRISE
- `SubscriptionRole`: WORKER | HIRER
- `SubscriptionStatus`: ACTIVE | CANCELLED | EXPIRED | PENDING
- `PostType`: GENERAL | JOB_UPDATE | ACHIEVEMENT | PORTFOLIO | ANNOUNCEMENT | HIRING
- `ReactionType`: LIKE | LOVE | INSIGHTFUL | CELEBRATE | SUPPORT
- `JobType`: FULL_TIME | PART_TIME | CONTRACT | TEMPORARY
- `LocationType`: REMOTE | ON_SITE | HYBRID
- `BudgetType`: FIXED | HOURLY | DAILY | WEEKLY | MONTHLY | CUSTOM
- `DurationType`: HOURS | DAYS | WEEKS | MONTHS | CUSTOM

## 3. All API Endpoints

Total route files: **23**  |  Total routes: **188**


### `src/routes/admin.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/stats` | `getPlatformStats` | 🟢 public | DataTable / ListPage |
| `GET` | `/users` | `getAllUsers` | 🟢 public | DataTable / ListPage |
| `GET` | `/users/:userId` | `getUserDetail` | 🟢 public | DetailPage / ViewModal |
| `PATCH` | `/users/:userId/ban` | `banUser` | 🟢 public | EditForm / StatusChanger |
| `PATCH` | `/users/:userId/unban` | `unbanUser` | 🟢 public | EditForm / StatusChanger |
| `DELETE` | `/users/:userId` | `deleteUser` | 🟢 public | DeleteConfirmModal |
| `PATCH` | `/users/:userId/verify` | `verifyWorker` | 🟢 public | EditForm / StatusChanger |
| `GET` | `/bookings` | `getAllBookings` | 🟢 public | DataTable / ListPage |
| `GET` | `/disputes` | `getDisputes` | 🟢 public | DataTable / ListPage |
| `PATCH` | `/disputes/:bookingId/resolve` | `resolveDispute` | 🟢 public | EditForm / StatusChanger |
| `POST` | `/categories` | `createCategory` | 🟢 public | CreateForm / CreateModal |
| `PATCH` | `/categories/:categoryId` | `updateCategory` | 🟢 public | EditForm / StatusChanger |
| `DELETE` | `/categories/:categoryId` | `deleteCategory` | 🟢 public | DeleteConfirmModal |
| `GET` | `/reviews` | `getAllReviews` | 🟢 public | DataTable / ListPage |
| `DELETE` | `/reviews/:reviewId` | `deleteReview` | 🟢 public | DeleteConfirmModal |
| `POST` | `/broadcast` | `broadcastNotification` | 🟢 public | CreateForm / CreateModal |

### `src/routes/ai.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `POST` | `/assist` | `res` | 🟡 auth | CreateForm / CreateModal |

### `src/routes/auth.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `POST` | `/register` | `register` | 🟢 public | CreateForm / CreateModal |
| `POST` | `/login` | `login` | 🟢 public | CreateForm / CreateModal |
| `GET` | `/verify-email` | `verifyEmail` | 🟢 public | DataTable / ListPage |
| `POST` | `/resend-verification` | `resendVerification` | 🟢 public | CreateForm / CreateModal |
| `POST` | `/forgot-password` | `forgotPassword` | 🟢 public | CreateForm / CreateModal |
| `POST` | `/reset-password` | `resetPassword` | 🟢 public | CreateForm / CreateModal |
| `POST` | `/refresh` | `refreshToken` | 🟢 public | CreateForm / CreateModal |
| `POST` | `/logout` | `logout` | 🟡 auth | CreateForm / CreateModal |
| `GET` | `/me` | `getMe` | 🟡 auth | DataTable / ListPage |

### `src/routes/booking.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `POST` | `/` | `createBooking` | 🟡 auth | CreateForm / CreateModal |
| `GET` | `/` | `getMyBookings` | 🟡 auth | DataTable / ListPage |
| `GET` | `/:id` | `getBooking` | 🟡 auth | DetailPage / ViewModal |
| `PATCH` | `/:id/status` | `updateBookingStatus` | 🟡 auth | EditForm / StatusChanger |
| `PATCH` | `/:id/checkin` | `checkIn` | 🟡 auth | EditForm / StatusChanger |
| `PATCH` | `/:id/checkout` | `checkOut` | 🟡 auth | EditForm / StatusChanger |
| `POST` | `/:id/sos` | `activateSOS` | 🟡 auth | CreateForm / CreateModal |
| `PATCH` | `/:id/sos/resolve` | `resolveSOS` | 🟡 auth | EditForm / StatusChanger |
| `PATCH` | `/:id/emergency-contact` | `updateEmergencyContact` | 🟡 auth | EditForm / StatusChanger |

### `src/routes/category.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/` | `getCategories` | 🟢 public | DataTable / ListPage |
| `GET` | `/:slug` | `getCategory` | 🟢 public | DetailPage / ViewModal |
| `DELETE` | `/:id` | `ADMIN` | 🟡 auth | DeleteConfirmModal |
| `PATCH` | `/:id` | `ADMIN` | 🟡 auth | EditForm / StatusChanger |
| `POST` | `/suggest` | `suggestCategory` | 🟡 auth | CreateForm / CreateModal |

### `src/routes/dispute.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `POST` | `/` | `raiseDispute` | 🟡 auth | CreateForm / CreateModal |
| `GET` | `/my` | `getMyDisputes` | 🟡 auth | DataTable / ListPage |
| `GET` | `/:bookingId` | `getDisputeDetail` | 🟡 auth | DetailPage / ViewModal |
| `PATCH` | `/:bookingId/cancel` | `cancelDispute` | 🟡 auth | EditForm / StatusChanger |
| `GET` | `/` | `ADMIN` | 🟡 auth | DataTable / ListPage |
| `PATCH` | `/:bookingId/resolve` | `ADMIN` | 🟡 auth | EditForm / StatusChanger |

### `src/routes/featured.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/packages` | `getPackages` | 🟢 public | DataTable / ListPage |
| `GET` | `/` | `getFeaturedUsers` | 🟢 public | DataTable / ListPage |
| `GET` | `/my` | `getMyFeatured` | 🟡 auth | DataTable / ListPage |
| `POST` | `/checkout` | `createFeaturedCheckout` | 🟡 auth | CreateForm / CreateModal |
| `POST` | `/verify` | `verifyFeaturedCheckout` | 🟡 auth | CreateForm / CreateModal |
| `GET` | `/invoice/:sessionId` | `getFeaturedInvoice` | 🟡 auth | DetailPage / ViewModal |

### `src/routes/hirer.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/me/profile` | `HIRER` | 🟡 auth | DataTable / ListPage |
| `PUT` | `/me/profile` | `HIRER` | 🟡 auth | EditForm / EditModal |
| `GET` | `/me/dashboard` | `HIRER` | 🟡 auth | DataTable / ListPage |
| `GET` | `/me/bookings` | `HIRER` | 🟡 auth | DataTable / ListPage |
| `GET` | `/me/saved-workers` | `HIRER` | 🟡 auth | DataTable / ListPage |
| `GET` | `/me/notifications` | `getNotifications` | 🟡 auth | DataTable / ListPage |
| `PATCH` | `/me/notifications/read` | `markNotificationsRead` | 🟡 auth | EditForm / StatusChanger |
| `GET` | `/me/reviews/received` | `HIRER` | 🟡 auth | DataTable / ListPage |
| `GET` | `/me/reviews/given` | `HIRER` | 🟡 auth | DataTable / ListPage |
| `GET` | `/me/reviews` | `HIRER` | 🟡 auth | DataTable / ListPage |
| `GET` | `/:userId` | `getHirerProfile` | 🟢 public | DetailPage / ViewModal |
| `GET` | `/:userId/profile` | `getHirerPublicProfile` | 🟢 public | DetailPage / ViewModal |

### `src/routes/insurance.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/plans` | `getInsurancePlans` | 🟢 public | DataTable / ListPage |
| `POST` | `/checkout` | `HIRER` | 🟡 auth | CreateForm / CreateModal |
| `POST` | `/verify` | `HIRER` | 🟡 auth | CreateForm / CreateModal |
| `GET` | `/my` | `HIRER` | 🟡 auth | DataTable / ListPage |

### `src/routes/job.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/` | `getJobPosts` | 🟢 public | DataTable / ListPage |
| `GET` | `/hirer/me` | `HIRER` | 🟡 auth | DataTable / ListPage |
| `GET` | `/worker/my-applications` | `WORKER` | 🟡 auth | DataTable / ListPage |
| `GET` | `/:id` | `getJobPost` | 🟡 auth | DetailPage / ViewModal |
| `POST` | `/` | `HIRER` | 🟡 auth | CreateForm / CreateModal |
| `PATCH` | `/:id/status` | `HIRER` | 🟡 auth | EditForm / StatusChanger |
| `GET` | `/:id/applications` | `HIRER` | 🟡 auth | DetailPage / ViewModal |
| `PATCH` | `/:id/applications/:applicationId` | `HIRER` | 🟡 auth | EditForm / StatusChanger |
| `POST` | `/:id/apply` | `WORKER` | 🟡 auth | CreateForm / CreateModal |

### `src/routes/message.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/conversations` | `getConversations` | 🟡 auth | DataTable / ListPage |
| `GET` | `/:conversationId` | `getMessages` | 🟡 auth | DetailPage / ViewModal |
| `POST` | `/` | `sendMessage` | 🟡 auth | CreateForm / CreateModal |
| `PATCH` | `/:conversationId/read` | `res` | 🟡 auth | EditForm / StatusChanger |

### `src/routes/notification.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/` | `getNotifications` | 🟢 public | DataTable / ListPage |
| `PATCH` | `/read-all` | `markAllAsRead` | 🟢 public | EditForm / StatusChanger |
| `POST` | `/request` | `res` | 🟡 auth | CreateForm / CreateModal |
| `PATCH` | `/:id/read` | `markAsRead` | 🟢 public | EditForm / StatusChanger |
| `DELETE` | `/clear-all` | `clearAllNotifications` | 🟢 public | DeleteConfirmModal |
| `DELETE` | `/:id` | `deleteNotification` | 🟢 public | DeleteConfirmModal |

### `src/routes/payment.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `POST` | `/webhook/stripe` | `json` | 🟢 public | CreateForm / CreateModal |
| `GET` | `/verify/paystack` | `verifyPaystack` | 🟢 public | DataTable / ListPage |
| `POST` | `/initiate-checkout/:bookingId` | `HIRER` | 🟢 public | CreateForm / CreateModal |
| `POST` | `/initiate/:bookingId` | `HIRER` | 🟢 public | CreateForm / CreateModal |
| `POST` | `/bank-transfer/:bookingId` | `HIRER` | 🟢 public | CreateForm / CreateModal |
| `PATCH` | `/bank-transfer/:bookingId/confirm` | `confirmBankTransfer` | 🟢 public | EditForm / StatusChanger |
| `POST` | `/crypto/:bookingId` | `HIRER` | 🟢 public | CreateForm / CreateModal |
| `PATCH` | `/crypto/:bookingId/confirm` | `confirmCryptoPayment` | 🟢 public | EditForm / StatusChanger |
| `POST` | `/release/:bookingId` | `HIRER` | 🟢 public | CreateForm / CreateModal |
| `POST` | `/refund/:bookingId` | `refundPayment` | 🟢 public | CreateForm / CreateModal |
| `GET` | `/earnings` | `WORKER` | 🟢 public | DataTable / ListPage |
| `POST` | `/withdraw` | `WORKER` | 🟢 public | CreateForm / CreateModal |
| `GET` | `/withdrawals` | `WORKER` | 🟢 public | DataTable / ListPage |
| `GET` | `/hirer` | `HIRER` | 🟢 public | DataTable / ListPage |
| `GET` | `/` | `ADMIN` | 🟢 public | DataTable / ListPage |
| `GET` | `/:bookingId` | `getPayment` | 🟢 public | DetailPage / ViewModal |

### `src/routes/post.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/feed` | `getFeed` | 🟡 auth | DataTable / ListPage |
| `GET` | `/my` | `getMyPosts` | 🟡 auth | DataTable / ListPage |
| `GET` | `/user/:userId` | `getUserPosts` | 🟡 auth | DetailPage / ViewModal |
| `GET` | `/:id` | `getPost` | 🟡 auth | DetailPage / ViewModal |
| `POST` | `/` | `createPost` | 🟡 auth | CreateForm / CreateModal |
| `PUT` | `/:id` | `updatePost` | 🟡 auth | EditForm / EditModal |
| `DELETE` | `/:id` | `deletePost` | 🟡 auth | DeleteConfirmModal |
| `POST` | `/:id/repost` | `repost` | 🟡 auth | CreateForm / CreateModal |
| `POST` | `/:id/react` | `reactToPost` | 🟡 auth | CreateForm / CreateModal |
| `GET` | `/:id/reactions` | `getReactions` | 🟡 auth | DetailPage / ViewModal |
| `POST` | `/:id/comments` | `addComment` | 🟡 auth | CreateForm / CreateModal |
| `GET` | `/:id/comments` | `getComments` | 🟡 auth | DetailPage / ViewModal |
| `DELETE` | `/comments/:commentId` | `deleteComment` | 🟡 auth | DeleteConfirmModal |

### `src/routes/review.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `POST` | `/` | `createReview` | 🟡 auth | CreateForm / CreateModal |
| `GET` | `/my/given` | `getMyGivenReviews` | 🟡 auth | DataTable / ListPage |
| `GET` | `/my/received` | `getMyReceivedReviews` | 🟡 auth | DataTable / ListPage |
| `GET` | `/check/:bookingId` | `checkReviewStatus` | 🟡 auth | DetailPage / ViewModal |
| `DELETE` | `/:reviewId` | `ADMIN` | 🟡 auth | DeleteConfirmModal |
| `GET` | `/worker/:userId` | `getWorkerReviews` | 🟢 public | DetailPage / ViewModal |
| `GET` | `/hirer/:userId` | `getHirerReviewsPublic` | 🟢 public | DetailPage / ViewModal |

### `src/routes/search.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/` | `globalSearch` | 🟢 public | DataTable / ListPage |
| `GET` | `/nearby` | `nearbyWorkers` | 🟢 public | DataTable / ListPage |
| `GET` | `/trending` | `getTrending` | 🟢 public | DataTable / ListPage |
| `GET` | `/filters` | `getFilterOptions` | 🟢 public | DataTable / ListPage |

### `src/routes/settings.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/profile` | `getProfile` | 🟢 public | DataTable / ListPage |
| `PATCH` | `/profile` | `updateProfile` | 🟢 public | EditForm / StatusChanger |
| `POST` | `/avatar` | `avatar` | 🟢 public | CreateForm / CreateModal |
| `PATCH` | `/worker-profile` | `updateWorkerProfile` | 🟢 public | EditForm / StatusChanger |
| `PATCH` | `/hirer-profile` | `updateHirerProfile` | 🟢 public | EditForm / StatusChanger |
| `PATCH` | `/password` | `changePassword` | 🟢 public | EditForm / StatusChanger |
| `GET` | `/security` | `getSecurityInfo` | 🟢 public | DataTable / ListPage |
| `GET` | `/notifications` | `getNotificationPrefs` | 🟢 public | DataTable / ListPage |
| `PATCH` | `/notifications` | `updateNotificationPrefs` | 🟢 public | EditForm / StatusChanger |
| `GET` | `/privacy` | `getPrivacySettings` | 🟢 public | DataTable / ListPage |
| `PATCH` | `/privacy` | `updatePrivacySettings` | 🟢 public | EditForm / StatusChanger |
| `GET` | `/payment-methods` | `getPaymentMethods` | 🟢 public | DataTable / ListPage |
| `GET` | `/activity` | `getActivitySummary` | 🟢 public | DataTable / ListPage |
| `DELETE` | `/account` | `deleteAccount` | 🟢 public | DeleteConfirmModal |

### `src/routes/subscription.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/plans` | `getPlans` | 🟢 public | DataTable / ListPage |
| `GET` | `/my` | `getMySubscription` | 🟡 auth | DataTable / ListPage |
| `POST` | `/checkout` | `createCheckout` | 🟡 auth | CreateForm / CreateModal |
| `POST` | `/verify` | `verifyCheckout` | 🟡 auth | CreateForm / CreateModal |
| `POST` | `/cancel` | `cancelSubscription` | 🟡 auth | CreateForm / CreateModal |
| `GET` | `/invoice/:sessionId` | `getInvoice` | 🟡 auth | DetailPage / ViewModal |

### `src/routes/translate.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `POST` | `/` | `res` | 🟡 auth | CreateForm / CreateModal |

### `src/routes/user.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `PUT` | `/me` | `updateProfile` | 🟡 auth | EditForm / EditModal |
| `PUT` | `/me/avatar` | `updateAvatar` | 🟡 auth | EditForm / EditModal |
| `DELETE` | `/me` | `deleteAccount` | 🟡 auth | DeleteConfirmModal |
| `GET` | `/:id` | `getProfile` | 🟢 public | DetailPage / ViewModal |

### `src/routes/verification.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/status` | `WORKER` | 🟡 auth | DataTable / ListPage |
| `POST` | `/submit-id` | `WORKER` | 🟡 auth | CreateForm / CreateModal |
| `POST` | `/submit-certification` | `WORKER` | 🟡 auth | CreateForm / CreateModal |
| `DELETE` | `/certifications/:certId` | `WORKER` | 🟡 auth | DeleteConfirmModal |
| `GET` | `/admin/stats` | `ADMIN` | 🟡 auth | DataTable / ListPage |
| `GET` | `/admin/pending` | `ADMIN` | 🟡 auth | DataTable / ListPage |
| `GET` | `/admin/verified` | `ADMIN` | 🟡 auth | DataTable / ListPage |
| `PATCH` | `/admin/:userId/review` | `ADMIN` | 🟡 auth | EditForm / StatusChanger |
| `PATCH` | `/admin/:userId/background-check` | `ADMIN` | 🟡 auth | EditForm / StatusChanger |
| `PATCH` | `/admin/certifications/:certId/verify` | `ADMIN` | 🟡 auth | EditForm / StatusChanger |
| `GET` | `/hirer/status` | `HIRER` | 🟡 auth | DataTable / ListPage |
| `POST` | `/hirer/submit` | `HIRER` | 🟡 auth | CreateForm / CreateModal |
| `GET` | `/admin/hirers/pending` | `ADMIN` | 🟡 auth | DataTable / ListPage |
| `PATCH` | `/admin/hirers/:userId/review` | `ADMIN` | 🟡 auth | EditForm / StatusChanger |

### `src/routes/videocall.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `POST` | `/:bookingId/initiate` | `initiateCall` | 🟢 public | CreateForm / CreateModal |
| `PATCH` | `/:bookingId/accept` | `acceptCall` | 🟢 public | EditForm / StatusChanger |
| `PATCH` | `/:bookingId/decline` | `declineCall` | 🟢 public | EditForm / StatusChanger |
| `PATCH` | `/:bookingId/end` | `endCall` | 🟢 public | EditForm / StatusChanger |
| `GET` | `/:bookingId` | `getCallStatus` | 🟢 public | DetailPage / ViewModal |

### `src/routes/worker.routes.js`

| Method | Path | Handler | Auth | Admin Component Needed |
| --- | --- | --- | --- | --- |
| `GET` | `/search` | `searchWorkers` | 🟢 public | DataTable / ListPage |
| `GET` | `/dashboard` | `WORKER` | 🟡 auth | DataTable / ListPage |
| `GET` | `/dashboard/notifications` | `WORKER` | 🟡 auth | DataTable / ListPage |
| `PATCH` | `/dashboard/notifications/read-all` | `WORKER` | 🟡 auth | EditForm / StatusChanger |
| `GET` | `/dashboard/earnings` | `WORKER` | 🟡 auth | DataTable / ListPage |
| `GET` | `/dashboard/reviews` | `WORKER` | 🟡 auth | DataTable / ListPage |
| `PUT` | `/profile` | `WORKER` | 🟡 auth | EditForm / EditModal |
| `POST` | `/portfolio` | `WORKER` | 🟡 auth | CreateForm / CreateModal |
| `DELETE` | `/portfolio/:id` | `WORKER` | 🟡 auth | DeleteConfirmModal |
| `POST` | `/certifications` | `WORKER` | 🟡 auth | CreateForm / CreateModal |
| `PUT` | `/availability` | `WORKER` | 🟡 auth | EditForm / EditModal |
| `POST` | `/categories` | `WORKER` | 🟡 auth | CreateForm / CreateModal |
| `DELETE` | `/categories/:categoryId` | `WORKER` | 🟡 auth | DeleteConfirmModal |
| `GET` | `/my-applications` | `WORKER` | 🟡 auth | DataTable / ListPage |
| `POST` | `/video-intro` | `WORKER` | 🟡 auth | CreateForm / CreateModal |
| `DELETE` | `/video-intro` | `WORKER` | 🟡 auth | DeleteConfirmModal |
| `GET` | `/:userId` | `getWorkerProfile` | 🟢 public | DetailPage / ViewModal |

## 4. Admin Panel — Build Roadmap by Section

Each section maps directly to backend route groups. Build order follows dependency chain.


### 👥 Users & Workers

> List, view, edit, ban, verify users. View worker profiles, categories, portfolio, certifications.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL ✅  UPDATE ✅  DELETE ✅


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/users` | 🟢 public | `getAllUsers` |
| `GET` | `/users/:userId` | 🟢 public | `getUserDetail` |
| `PATCH` | `/users/:userId/ban` | 🟢 public | `banUser` |
| `PATCH` | `/users/:userId/unban` | 🟢 public | `unbanUser` |
| `DELETE` | `/users/:userId` | 🟢 public | `deleteUser` |
| `PATCH` | `/users/:userId/verify` | 🟢 public | `verifyWorker` |
| `POST` | `/register` | 🟢 public | `register` |
| `POST` | `/login` | 🟢 public | `login` |
| `GET` | `/verify-email` | 🟢 public | `verifyEmail` |
| `POST` | `/resend-verification` | 🟢 public | `resendVerification` |
| `POST` | `/forgot-password` | 🟢 public | `forgotPassword` |
| `POST` | `/reset-password` | 🟢 public | `resetPassword` |
| `POST` | `/refresh` | 🟢 public | `refreshToken` |
| `POST` | `/logout` | 🟡 auth | `logout` |
| `GET` | `/me` | 🟡 auth | `getMe` |
| `GET` | `/me/profile` | 🟡 auth | `HIRER` |
| `PUT` | `/me/profile` | 🟡 auth | `HIRER` |
| `GET` | `/:userId/profile` | 🟢 public | `getHirerPublicProfile` |
| `GET` | `/worker/my-applications` | 🟡 auth | `WORKER` |
| `GET` | `/user/:userId` | 🟡 auth | `getUserPosts` |
| `GET` | `/worker/:userId` | 🟢 public | `getWorkerReviews` |
| `GET` | `/profile` | 🟢 public | `getProfile` |
| `PATCH` | `/profile` | 🟢 public | `updateProfile` |
| `PATCH` | `/worker-profile` | 🟢 public | `updateWorkerProfile` |
| `PUT` | `/me` | 🟡 auth | `updateProfile` |
| `PUT` | `/me/avatar` | 🟡 auth | `updateAvatar` |
| `DELETE` | `/me` | 🟡 auth | `deleteAccount` |
| `GET` | `/:id` | 🟢 public | `getProfile` |
| `GET` | `/search` | 🟢 public | `searchWorkers` |
| `GET` | `/dashboard` | 🟡 auth | `WORKER` |
| `GET` | `/dashboard/notifications` | 🟡 auth | `WORKER` |
| `PATCH` | `/dashboard/notifications/read-all` | 🟡 auth | `WORKER` |
| `GET` | `/dashboard/earnings` | 🟡 auth | `WORKER` |
| `GET` | `/dashboard/reviews` | 🟡 auth | `WORKER` |
| `PUT` | `/profile` | 🟡 auth | `WORKER` |
| `POST` | `/portfolio` | 🟡 auth | `WORKER` |
| `DELETE` | `/portfolio/:id` | 🟡 auth | `WORKER` |
| `POST` | `/certifications` | 🟡 auth | `WORKER` |
| `PUT` | `/availability` | 🟡 auth | `WORKER` |
| `POST` | `/categories` | 🟡 auth | `WORKER` |
| `DELETE` | `/categories/:categoryId` | 🟡 auth | `WORKER` |
| `GET` | `/my-applications` | 🟡 auth | `WORKER` |
| `POST` | `/video-intro` | 🟡 auth | `WORKER` |
| `DELETE` | `/video-intro` | 🟡 auth | `WORKER` |
| `GET` | `/:userId` | 🟢 public | `getWorkerProfile` |

**Admin components to build:**

- `UsersTable` — sortable/filterable list of all users + role badge
- `UserDetailDrawer` — full profile, edit role, ban, delete
- `WorkersPanel` — worker-specific: categories, portfolio, certifications, availability
- `UserStatsBar` — total users, new this week, banned count

---

### 📅 Bookings

> All bookings table, filter by status, view detail, force-complete, cancel, assign disputes.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL ✅  UPDATE ✅  DELETE —


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/bookings` | 🟢 public | `getAllBookings` |
| `POST` | `/` | 🟡 auth | `createBooking` |
| `GET` | `/` | 🟡 auth | `getMyBookings` |
| `GET` | `/:id` | 🟡 auth | `getBooking` |
| `PATCH` | `/:id/status` | 🟡 auth | `updateBookingStatus` |
| `PATCH` | `/:id/checkin` | 🟡 auth | `checkIn` |
| `PATCH` | `/:id/checkout` | 🟡 auth | `checkOut` |
| `POST` | `/:id/sos` | 🟡 auth | `activateSOS` |
| `PATCH` | `/:id/sos/resolve` | 🟡 auth | `resolveSOS` |
| `PATCH` | `/:id/emergency-contact` | 🟡 auth | `updateEmergencyContact` |
| `GET` | `/me/bookings` | 🟡 auth | `HIRER` |

**Admin components to build:**

- `BookingsTable` — all bookings with status filter + date range
- `BookingDetailModal` — full booking view, status override, notes
- `BookingStatusChanger` — force accept / complete / cancel with reason
- `BookingStatsBar` — active, pending, completed, disputed counts

---

### 💳 Payments & Payouts

> Payment records, escrow status, payout queue, manual release, refunds, fee settings.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL ✅  UPDATE ✅  DELETE —


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `POST` | `/webhook/stripe` | 🟢 public | `json` |
| `GET` | `/verify/paystack` | 🟢 public | `verifyPaystack` |
| `POST` | `/initiate-checkout/:bookingId` | 🟢 public | `HIRER` |
| `POST` | `/initiate/:bookingId` | 🟢 public | `HIRER` |
| `POST` | `/bank-transfer/:bookingId` | 🟢 public | `HIRER` |
| `PATCH` | `/bank-transfer/:bookingId/confirm` | 🟢 public | `confirmBankTransfer` |
| `POST` | `/crypto/:bookingId` | 🟢 public | `HIRER` |
| `PATCH` | `/crypto/:bookingId/confirm` | 🟢 public | `confirmCryptoPayment` |
| `POST` | `/release/:bookingId` | 🟢 public | `HIRER` |
| `POST` | `/refund/:bookingId` | 🟢 public | `refundPayment` |
| `GET` | `/earnings` | 🟢 public | `WORKER` |
| `POST` | `/withdraw` | 🟢 public | `WORKER` |
| `GET` | `/withdrawals` | 🟢 public | `WORKER` |
| `GET` | `/hirer` | 🟢 public | `HIRER` |
| `GET` | `/` | 🟢 public | `ADMIN` |
| `GET` | `/:bookingId` | 🟢 public | `getPayment` |
| `GET` | `/payment-methods` | 🟢 public | `getPaymentMethods` |

**Admin components to build:**

- `PaymentsTable` — all transactions, filter by status/provider
- `PayoutQueue` — pending worker payouts, bulk release
- `ReleasePaymentModal` — confirm escrow release with audit note
- `RefundModal` — initiate refund with reason
- `RevenueChart` — monthly revenue with fee breakdown

---

### 💼 Jobs & Applications

> Job posts, applications per job, approve/reject, flag, delete.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL ✅  UPDATE ✅  DELETE —


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/` | 🟢 public | `getJobPosts` |
| `GET` | `/hirer/me` | 🟡 auth | `HIRER` |
| `GET` | `/:id` | 🟡 auth | `getJobPost` |
| `POST` | `/` | 🟡 auth | `HIRER` |
| `PATCH` | `/:id/status` | 🟡 auth | `HIRER` |
| `GET` | `/:id/applications` | 🟡 auth | `HIRER` |
| `PATCH` | `/:id/applications/:applicationId` | 🟡 auth | `HIRER` |
| `POST` | `/:id/apply` | 🟡 auth | `WORKER` |

**Admin components to build:**

- `JobsTable` — all job posts, filter by status/category
- `JobDetailModal` — full job view, flag, delete, feature
- `ApplicationsPanel` — per-job applications, worker info

---

### ⚖️ Disputes

> Dispute queue, assign resolver, add ruling, close dispute, link to booking.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL ✅  UPDATE ✅  DELETE —


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/disputes` | 🟢 public | `getDisputes` |
| `PATCH` | `/disputes/:bookingId/resolve` | 🟢 public | `resolveDispute` |
| `POST` | `/` | 🟡 auth | `raiseDispute` |
| `GET` | `/my` | 🟡 auth | `getMyDisputes` |
| `GET` | `/:bookingId` | 🟡 auth | `getDisputeDetail` |
| `PATCH` | `/:bookingId/cancel` | 🟡 auth | `cancelDispute` |
| `GET` | `/` | 🟡 auth | `ADMIN` |
| `PATCH` | `/:bookingId/resolve` | 🟡 auth | `ADMIN` |

**Admin components to build:**

- `DisputeQueue` — open disputes sorted by age
- `DisputeDetailPanel` — full timeline, messages, evidence
- `RulingForm` — add admin ruling, assign winner, trigger refund/release
- `DisputeStatsBar` — open, resolved, avg resolution time

---

### ⭐ Reviews

> All reviews, flag/remove, respond as platform, ratings analytics.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL ✅  UPDATE ✅  DELETE ✅


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/reviews` | 🟢 public | `getAllReviews` |
| `DELETE` | `/reviews/:reviewId` | 🟢 public | `deleteReview` |
| `GET` | `/me/reviews/received` | 🟡 auth | `HIRER` |
| `GET` | `/me/reviews/given` | 🟡 auth | `HIRER` |
| `GET` | `/me/reviews` | 🟡 auth | `HIRER` |
| `POST` | `/` | 🟡 auth | `createReview` |
| `GET` | `/my/given` | 🟡 auth | `getMyGivenReviews` |
| `GET` | `/my/received` | 🟡 auth | `getMyReceivedReviews` |
| `GET` | `/check/:bookingId` | 🟡 auth | `checkReviewStatus` |
| `DELETE` | `/:reviewId` | 🟡 auth | `ADMIN` |
| `GET` | `/hirer/:userId` | 🟢 public | `getHirerReviewsPublic` |
| `PATCH` | `/admin/:userId/review` | 🟡 auth | `ADMIN` |
| `PATCH` | `/admin/hirers/:userId/review` | 🟡 auth | `ADMIN` |

**Admin components to build:**

- `ReviewsTable` — all reviews, rating filter, flagged filter
- `ReviewFlagModal` — flag reason + remove from public

---

### 🏷️ Categories

> CRUD categories, slugs, icons, worker count per category, featured toggle.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL ✅  UPDATE ✅  DELETE ✅


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `POST` | `/categories` | 🟢 public | `createCategory` |
| `PATCH` | `/categories/:categoryId` | 🟢 public | `updateCategory` |
| `DELETE` | `/categories/:categoryId` | 🟢 public | `deleteCategory` |
| `GET` | `/` | 🟢 public | `getCategories` |
| `GET` | `/:slug` | 🟢 public | `getCategory` |
| `DELETE` | `/:id` | 🟡 auth | `ADMIN` |
| `PATCH` | `/:id` | 🟡 auth | `ADMIN` |
| `POST` | `/suggest` | 🟡 auth | `suggestCategory` |

**Admin components to build:**

- `CategoriesTable` — list with worker count per category
- `CategoryForm` — create/edit: name, slug, icon, parent, featured toggle
- `CategoryWorkerCount` — badge showing assigned workers

---

### 🔔 Notifications

> Broadcast notifications, templates, per-user history, mark read.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL —  UPDATE ✅  DELETE ✅


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/me/notifications` | 🟡 auth | `getNotifications` |
| `PATCH` | `/me/notifications/read` | 🟡 auth | `markNotificationsRead` |
| `GET` | `/` | 🟢 public | `getNotifications` |
| `PATCH` | `/read-all` | 🟢 public | `markAllAsRead` |
| `POST` | `/request` | 🟡 auth | `res` |
| `PATCH` | `/:id/read` | 🟢 public | `markAsRead` |
| `DELETE` | `/clear-all` | 🟢 public | `clearAllNotifications` |
| `DELETE` | `/:id` | 🟢 public | `deleteNotification` |
| `GET` | `/notifications` | 🟢 public | `getNotificationPrefs` |
| `PATCH` | `/notifications` | 🟢 public | `updateNotificationPrefs` |

**Admin components to build:**

- `BroadcastForm` — send to all / role / user segment
- `NotifHistoryTable` — sent notifications with open rate
- `TemplateEditor` — email / push notification templates

---

### 💬 Messages

> Conversation list, view threads (read-only), flag abusive messages.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL ✅  UPDATE ✅  DELETE —


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/conversations` | 🟡 auth | `getConversations` |
| `GET` | `/:conversationId` | 🟡 auth | `getMessages` |
| `POST` | `/` | 🟡 auth | `sendMessage` |
| `PATCH` | `/:conversationId/read` | 🟡 auth | `res` |

**Admin components to build:**

- `ConversationListTable` — all conversations, flagged first
- `ThreadViewerModal` — read-only message thread + flag

---

### 🛡️ Verifications

> Pending ID verifications, approve/reject, view documents, audit log.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL —  UPDATE ✅  DELETE ✅


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/status` | 🟡 auth | `WORKER` |
| `POST` | `/submit-id` | 🟡 auth | `WORKER` |
| `POST` | `/submit-certification` | 🟡 auth | `WORKER` |
| `DELETE` | `/certifications/:certId` | 🟡 auth | `WORKER` |
| `GET` | `/admin/stats` | 🟡 auth | `ADMIN` |
| `GET` | `/admin/pending` | 🟡 auth | `ADMIN` |
| `GET` | `/admin/verified` | 🟡 auth | `ADMIN` |
| `PATCH` | `/admin/:userId/background-check` | 🟡 auth | `ADMIN` |
| `PATCH` | `/admin/certifications/:certId/verify` | 🟡 auth | `ADMIN` |
| `GET` | `/hirer/status` | 🟡 auth | `HIRER` |
| `POST` | `/hirer/submit` | 🟡 auth | `HIRER` |
| `GET` | `/admin/hirers/pending` | 🟡 auth | `ADMIN` |

**Admin components to build:**

- `VerifQueue` — pending ID verifications sorted by submitted date
- `DocViewerModal` — display uploaded ID documents
- `ApproveRejectBar` — one-click approve/reject with reason

---

### 🔒 Insurance

> Plans, active policies per booking, claims, payout triggers.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL —  UPDATE —  DELETE —


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/plans` | 🟢 public | `getInsurancePlans` |
| `POST` | `/checkout` | 🟡 auth | `HIRER` |
| `POST` | `/verify` | 🟡 auth | `HIRER` |
| `GET` | `/my` | 🟡 auth | `HIRER` |

**Admin components to build:**

- `PoliciesTable` — active policies per booking
- `ClaimsQueue` — open claims, link to booking
- `ClaimPayoutTrigger` — admin-initiated payout

---

### 💎 Subscriptions

> Plans, active subs per user, upgrade/downgrade, cancellations, billing history.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL ✅  UPDATE —  DELETE —


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/plans` | 🟢 public | `getPlans` |
| `GET` | `/my` | 🟡 auth | `getMySubscription` |
| `POST` | `/checkout` | 🟡 auth | `createCheckout` |
| `POST` | `/verify` | 🟡 auth | `verifyCheckout` |
| `POST` | `/cancel` | 🟡 auth | `cancelSubscription` |
| `GET` | `/invoice/:sessionId` | 🟡 auth | `getInvoice` |

**Admin components to build:**

- `PlansManager` — create/edit plans, pricing, features
- `ActiveSubsTable` — users on each plan, renewal dates
- `BillingHistoryTable` — all subscription payments

---

### 🚀 Boosts & Featured

> Active boosts, approve listing boosts, featured slots management, pricing.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL ✅  UPDATE —  DELETE —


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/packages` | 🟢 public | `getPackages` |
| `GET` | `/` | 🟢 public | `getFeaturedUsers` |
| `GET` | `/my` | 🟡 auth | `getMyFeatured` |
| `POST` | `/checkout` | 🟡 auth | `createFeaturedCheckout` |
| `POST` | `/verify` | 🟡 auth | `verifyFeaturedCheckout` |
| `GET` | `/invoice/:sessionId` | 🟡 auth | `getFeaturedInvoice` |

**Admin components to build:**

- `BoostQueue` — pending boost requests
- `FeaturedSlotsManager` — which listings are featured
- `BoostPricingEditor` — set boost durations and prices

---

### 📊 Analytics & Reports

> Revenue chart, user growth, booking funnel, top workers, top hirers, export CSV.


**CRUD coverage:** CREATE —  LIST ✅  DETAIL —  UPDATE —  DELETE —


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `GET` | `/stats` | 🟢 public | `getPlatformStats` |
| `GET` | `/me/dashboard` | 🟡 auth | `HIRER` |

**Admin components to build:**

- `RevenueChart` — monthly/weekly with Recharts
- `UserGrowthChart` — new users over time
- `BookingFunnelChart` — conversion: posted → accepted → completed
- `TopWorkersTable` — by earnings / bookings
- `TopHirersTable` — by spend / bookings
- `ExportCSVButton` — export any table

---

### ⚙️ Platform Settings

> Fee %, platform config, feature flags, email templates, maintenance mode.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL —  UPDATE ✅  DELETE ✅


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `POST` | `/avatar` | 🟢 public | `avatar` |
| `PATCH` | `/hirer-profile` | 🟢 public | `updateHirerProfile` |
| `PATCH` | `/password` | 🟢 public | `changePassword` |
| `GET` | `/security` | 🟢 public | `getSecurityInfo` |
| `GET` | `/privacy` | 🟢 public | `getPrivacySettings` |
| `PATCH` | `/privacy` | 🟢 public | `updatePrivacySettings` |
| `GET` | `/activity` | 🟢 public | `getActivitySummary` |
| `DELETE` | `/account` | 🟢 public | `deleteAccount` |

**Admin components to build:**

- `FeeSettings` — platform fee %, payout thresholds
- `FeatureFlags` — toggle features on/off
- `MaintenanceToggle` — enable maintenance mode banner

---

### 📦 Other

> Misc endpoints not categorised above.


**CRUD coverage:** CREATE ✅  LIST ✅  DETAIL ✅  UPDATE ✅  DELETE ✅


| Method | Endpoint | Auth | Handler |
| --- | --- | --- | --- |
| `POST` | `/broadcast` | 🟢 public | `broadcastNotification` |
| `POST` | `/assist` | 🟡 auth | `res` |
| `GET` | `/me/saved-workers` | 🟡 auth | `HIRER` |
| `GET` | `/:userId` | 🟢 public | `getHirerProfile` |
| `GET` | `/feed` | 🟡 auth | `getFeed` |
| `GET` | `/my` | 🟡 auth | `getMyPosts` |
| `GET` | `/:id` | 🟡 auth | `getPost` |
| `POST` | `/` | 🟡 auth | `createPost` |
| `PUT` | `/:id` | 🟡 auth | `updatePost` |
| `DELETE` | `/:id` | 🟡 auth | `deletePost` |
| `POST` | `/:id/repost` | 🟡 auth | `repost` |
| `POST` | `/:id/react` | 🟡 auth | `reactToPost` |
| `GET` | `/:id/reactions` | 🟡 auth | `getReactions` |
| `POST` | `/:id/comments` | 🟡 auth | `addComment` |
| `GET` | `/:id/comments` | 🟡 auth | `getComments` |
| `DELETE` | `/comments/:commentId` | 🟡 auth | `deleteComment` |
| `GET` | `/` | 🟢 public | `globalSearch` |
| `GET` | `/nearby` | 🟢 public | `nearbyWorkers` |
| `GET` | `/trending` | 🟢 public | `getTrending` |
| `GET` | `/filters` | 🟢 public | `getFilterOptions` |
| `POST` | `/` | 🟡 auth | `res` |
| `POST` | `/:bookingId/initiate` | 🟢 public | `initiateCall` |
| `PATCH` | `/:bookingId/accept` | 🟢 public | `acceptCall` |
| `PATCH` | `/:bookingId/decline` | 🟢 public | `declineCall` |
| `PATCH` | `/:bookingId/end` | 🟢 public | `endCall` |
| `GET` | `/:bookingId` | 🟢 public | `getCallStatus` |

**Admin components to build:**

- `GenericApiExplorer` — raw endpoint tester for misc routes

---

## 5. Middleware Inventory

| File | Type | Functions |
| --- | --- | --- |
| `src/middleware/auth.middleware.js` | 🟡 auth | protect, optionalProtect |
| `src/middleware/error.middleware.js` | 🟢 general |  |
| `src/middleware/role.middleware.js` | 🔴 admin guard |  |
| `src/middleware/upload.middleware.js` | 🟢 general |  |

## 6. Controller Function Inventory

**`src/controllers/admin.controller.js`** — 16 functions

`getPlatformStats`  ·  `getAllUsers`  ·  `getUserDetail`  ·  `banUser`  ·  `unbanUser`  ·  `deleteUser`  ·  `verifyWorker`  ·  `getAllBookings`  ·  `getDisputes`  ·  `resolveDispute`  ·  `createCategory`  ·  `updateCategory`  ·  `deleteCategory`  ·  `getAllReviews`  ·  `deleteReview`  ·  `broadcastNotification`


**`src/controllers/auth.controller.js`** — 9 functions

`register`  ·  `verifyEmail`  ·  `resendVerification`  ·  `login`  ·  `refreshToken`  ·  `logout`  ·  `getMe`  ·  `forgotPassword`  ·  `resetPassword`


**`src/controllers/booking.controller.js`** — 9 functions

`createBooking`  ·  `getMyBookings`  ·  `getBooking`  ·  `updateBookingStatus`  ·  `checkIn`  ·  `checkOut`  ·  `activateSOS`  ·  `resolveSOS`  ·  `updateEmergencyContact`


**`src/controllers/category.controller.js`** — 5 functions

`getCategories`  ·  `getCategory`  ·  `suggestCategory`  ·  `deleteCategory`  ·  `updateCategory`


**`src/controllers/dispute.controller.js`** — 6 functions

`raiseDispute`  ·  `getMyDisputes`  ·  `getDisputeDetail`  ·  `resolveDispute`  ·  `cancelDispute`  ·  `getAllDisputes`


**`src/controllers/featured.controller.js`** — 6 functions

`getPackages`  ·  `getFeaturedUsers`  ·  `createFeaturedCheckout`  ·  `verifyFeaturedCheckout`  ·  `getMyFeatured`  ·  `getFeaturedInvoice`


**`src/controllers/hirer.controller.js`** — 9 functions

`getMyHirerProfile`  ·  `updateHirerProfile`  ·  `getHirerProfile`  ·  `getHirerBookings`  ·  `getHirerDashboard`  ·  `getSavedWorkers`  ·  `getHirerReviews`  ·  `getNotifications`  ·  `markNotificationsRead`


**`src/controllers/insurance.controller.js`** — 4 functions

`getInsurancePlans`  ·  `createInsuranceCheckout`  ·  `verifyInsuranceCheckout`  ·  `getMyInsurance`


**`src/controllers/job.controller.js`** — 10 functions

`createJobPost`  ·  `getJobPosts`  ·  `getJobPost`  ·  `getMyJobPosts`  ·  `updateJobPostStatus`  ·  `applyToJob`  ·  `getJobApplications`  ·  `updateApplicationStatus`  ·  `getMyApplications`  ·  `getHirerPublicProfile`


**`src/controllers/message.controller.js`** — 3 functions

`getConversations`  ·  `getMessages`  ·  `sendMessage`


**`src/controllers/notification.controller.js`** — 7 functions

`getNotifications`  ·  `markAsRead`  ·  `markAllAsRead`  ·  `deleteNotification`  ·  `clearAllNotifications`  ·  `sendRealTimeNotification`  ·  `notifyBookingUpdate`


**`src/controllers/payment.controller.js`** — 17 functions

`initiateBookingPayment`  ·  `verifyPaystack`  ·  `stripeWebhook`  ·  `markPaymentHeld`  ·  `releasePayment`  ·  `refundPayment`  ·  `getPayment`  ·  `getAllPayments`  ·  `getWorkerEarnings`  ·  `getHirerPayments`  ·  `requestWithdrawal`  ·  `getWithdrawals`  ·  `initiateBankTransfer`  ·  `confirmBankTransfer`  ·  `initiateCryptoPayment`  ·  `confirmCryptoPayment`  ·  `initiateStripeCheckout`


**`src/controllers/post.controller.js`** — 13 functions

`getFeed`  ·  `getMyPosts`  ·  `getUserPosts`  ·  `getPost`  ·  `createPost`  ·  `updatePost`  ·  `deletePost`  ·  `repost`  ·  `reactToPost`  ·  `getReactions`  ·  `addComment`  ·  `getComments`  ·  `deleteComment`


**`src/controllers/review.controller.js`** — 7 functions

`createReview`  ·  `getWorkerReviews`  ·  `getHirerReviewsPublic`  ·  `getMyGivenReviews`  ·  `getMyReceivedReviews`  ·  `checkReviewStatus`  ·  `deleteReview`


**`src/controllers/search.controller.js`** — 4 functions

`globalSearch`  ·  `nearbyWorkers`  ·  `getTrending`  ·  `getFilterOptions`


**`src/controllers/settings.controller.js`** — 14 functions

`getProfile`  ·  `updateProfile`  ·  `updateAvatar`  ·  `updateWorkerProfile`  ·  `updateHirerProfile`  ·  `changePassword`  ·  `getNotificationPrefs`  ·  `updateNotificationPrefs`  ·  `getPrivacySettings`  ·  `updatePrivacySettings`  ·  `getSecurityInfo`  ·  `deleteAccount`  ·  `getPaymentMethods`  ·  `getActivitySummary`


**`src/controllers/subscription.controller.js`** — 6 functions

`getPlans`  ·  `getMySubscription`  ·  `createCheckout`  ·  `verifyCheckout`  ·  `cancelSubscription`  ·  `getInvoice`


**`src/controllers/user.controller.js`** — 4 functions

`getProfile`  ·  `updateProfile`  ·  `updateAvatar`  ·  `deleteAccount`


**`src/controllers/verification.controller.js`** — 14 functions

`submitIdVerification`  ·  `submitCertification`  ·  `getVerificationStatus`  ·  `deleteCertification`  ·  `getPendingVerifications`  ·  `getVerifiedWorkers`  ·  `reviewVerification`  ·  `verifyCertification`  ·  `updateBackgroundCheck`  ·  `getVerificationStats`  ·  `submitHirerVerification`  ·  `getHirerVerificationStatus`  ·  `getPendingHirerVerifications`  ·  `reviewHirerVerification`


**`src/controllers/videocall.controller.js`** — 5 functions

`initiateCall`  ·  `acceptCall`  ·  `declineCall`  ·  `endCall`  ·  `getCallStatus`


**`src/controllers/worker.controller.js`** — 15 functions

`searchWorkers`  ·  `getWorkerProfile`  ·  `updateWorkerProfile`  ·  `deletePortfolio`  ·  `addPortfolio`  ·  `addCertification`  ·  `updateAvailability`  ·  `addCategory`  ·  `removeCategory`  ·  `getWorkerDashboard`  ·  `getWorkerNotifications`  ·  `markAllNotificationsRead`  ·  `getMyReviews`  ·  `addVideoIntro`  ·  `deleteVideoIntro`


## 7. Suggested Admin Panel File Structure

```

admin/

├── src/

│   ├── api/            # Axios client + per-section API files

│   ├── components/     # Shared: Table, Modal, Badge, StatCard, Sidebar

│   ├── pages/          # One folder per section

│   │   ├── users/    # Users & Workers

│   │   ├── bookings/    # Bookings

│   │   ├── payments/    # Payments & Payouts

│   │   ├── jobs/    # Jobs & Applications

│   │   ├── disputes/    # Disputes

│   │   ├── reviews/    # Reviews

│   │   ├── categories/    # Categories

│   │   ├── notifications/    # Notifications

│   │   ├── messages/    # Messages

│   │   ├── verifications/    # Verifications

│   │   ├── insurance/    # Insurance

│   │   ├── subscriptions/    # Subscriptions

│   │   ├── boosts/    # Boosts & Featured

│   │   ├── reports/    # Analytics & Reports

│   │   ├── settings/    # Platform Settings

│   │   ├── other/    # Other

│   ├── hooks/          # useTable, useModal, useToast, useAuth

│   ├── store/          # Zustand slices per section

│   ├── utils/          # fmtDate, fmtCurrency, export, roleGuard

│   └── App.jsx

├── .env.local          # VITE_API_BASE_URL

└── package.json        # Vite + React + Tailwind + Tanstack Table + Recharts

```


## 8. Recommended Build Order

Follow this sequence — later sections depend on earlier ones (e.g. disputes need bookings).


| Phase | Section | Estimated Components | Depends On |
| --- | --- | --- | --- |
| 1 — Foundation | Auth / Login | LoginPage, AdminGuard, Layout, Sidebar | — |
| 1 — Foundation | Dashboard Home | StatsBar, RevenueChart, ActivityFeed | all sections |
| 2 — Core Data | Users & Workers | UsersTable, UserDetail, WorkerProfile, BanModal | — |
| 2 — Core Data | Categories | CategoryTable, CategoryForm, SlugEditor | — |
| 3 — Transactions | Bookings | BookingsTable, BookingDetail, StatusChanger | Users |
| 3 — Transactions | Payments & Payouts | PaymentsTable, PayoutQueue, ReleaseModal | Bookings |
| 4 — Content | Jobs & Applications | JobsTable, JobDetail, ApplicationsPanel | Users |
| 4 — Content | Reviews | ReviewsTable, FlagModal, RatingChart | Users, Bookings |
| 5 — Safety | Disputes | DisputeQueue, DisputeDetail, RulingForm | Bookings |
| 5 — Safety | Verifications | VerifQueue, DocViewer, ApproveRejectBar | Users |
| 6 — Engagement | Notifications | BroadcastForm, NotifHistory, TemplateEditor | Users |
| 6 — Engagement | Messages | ConversationList, ThreadViewer | Users |
| 7 — Monetisation | Subscriptions | PlansTable, ActiveSubs, BillingHistory | Users, Payments |
| 7 — Monetisation | Boosts | BoostQueue, FeaturedSlots, PricingEditor | Users |
| 7 — Monetisation | Insurance | PoliciesTable, ClaimsQueue, PayoutTrigger | Bookings |
| 8 — Insights | Analytics & Reports | RevenueChart, UserGrowth, FunnelChart, CSV Export | all |
| 9 — Config | Platform Settings | FeeSlider, FeatureFlags, EmailTemplates | — |
| 9 — Config | Media | FileManager, OrphanCleaner | — |

## 9. Admin API Client Pattern

Each section gets its own API file. Pattern to use:

```js

// src/api/bookings.js

import api from './client';

export const getBookings = (params) => api.get('/admin/bookings', { params });

export const getBooking  = (id)     => api.get(`/admin/bookings/${id}`);

export const updateBooking = (id, data) => api.patch(`/admin/bookings/${id}`, data);

export const deleteBooking = (id)   => api.delete(`/admin/bookings/${id}`);

```


## 10. Gaps & Recommendations

- ⚠️ No Redis — consider caching admin dashboard stats
- ❌ No AuditLog model — recommend adding for admin action tracking (who changed what)

---

*This report was generated by `audit-backend.js`. Re-run after any schema or route changes.*
