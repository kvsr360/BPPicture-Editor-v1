# Product and application-channel references

Checked 13 November 2026. The editor opens in General Use. Application-channel guidance appears during passport export.

| Reference | Workflow observed | Implementation choice |
| --- | --- | --- |
| [IDPhoto4You](https://www.idphoto4you.com/) | Country and photo-type selection, a crop step and a download. | A three-step workflow with visible framing and download actions. |
| [PhotoAiD Malaysia](https://photoaid.com/en-my/passport-photo) | Malaysia-oriented commercial guidance and photo checks, per the supplied brief. The listed page was unavailable during this check. | Use government sources for the export guidance. |
| [Passport Photo Maker – VISA/ID](https://play.google.com/store/apps/details?id=np.com.njs.autophotos) | Android photo formatting and optional background removal. The MyOnline portal references it as third-party software. | Keep capture, editing and download accessible from the workflow. |
| [remove.bg](https://www.remove.bg/help/a/how-to-use-magic-brush.class) | Brush options for erasing and restoring a cutout. | Offer local automatic masking and manual erase/restore. |
| [Adobe Lightroom Mobile](https://helpx.adobe.com/lightroom/mobile/share-save-and-export/copy-and-paste-edits-to-photos.html) | Copy selected settings and apply to multiple photos. | Copy light, colour or detail while preserving the target crop and brush marks. |

| Channel | Verified rule and application behavior |
| --- | --- |
| [Malaysia MyOnline Pasport](https://imigresen-online.imi.gov.my/eservices/myPasport?lang=ms) | The online renewal portal calls for a photo taken within one month with a white, shadow-free background and rejects AI-generated or AI-modified photos. It separately references a third-party app. The editor offers original bytes first and labels any edited export. No mandatory online pixel dimensions or byte limits are encoded. |
| [Malaysia passport division](https://www.imi.gov.my/index.php/en/main-services/passport/malaysian-international-passport/) | Facial Live Capture is used at the passport division. The published 35 × 50 mm, white-background specification is stated under the note for children under four. The app's 7:10 frame is a formatting option. |
| [Jabatan Pendaftaran Negara](https://www.jpn.gov.my/perkhidmatan/kad-pengenalan/permohonan-mykad-bagi-kanak-kanak-12-tahun/) | JPN provides the process for a first MyKad application at age 12. The ID Photo option is a general formatting profile. |
| [UK digital passport](https://www.gov.uk/photos-for-passports) | The source must be unaltered, with at least 600 × 750 pixels, 50 KB–10 MB and a plain light-coloured background. The UK application service handles cropping. The app checks only source dimensions and bytes and preserves the original file for download. |
| [U.S. Department of State](https://travel.state.gov/content/travel/en/passports/how-apply/photos.html) | A printed passport photo must be 2 × 2 inches. U.S. guidance requires an unaltered image. This was reviewed as an international benchmark. |

[MDN's media capture documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) describes secure-context access, user permission and releasing a track before switching cameras. [Google MediaPipe's Image Segmenter guide](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter) documents the on-device selfie segmenter and its person-confidence channel. The [MediaPipe repository](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE) publishes the runtime license. The app loads version 0.10.21 of the vision runtime and Google's versioned selfie model from their asset hosts.
