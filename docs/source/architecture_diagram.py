"""Architecture diagram in plain AWS-icon style (like a draw.io diagram)."""
import os
import sys
from reportlab.lib import colors
from reportlab.platypus import Flowable

IC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons") + os.sep
AWSLOGO = IC + "aws.png"
LINE = colors.HexColor("#545B64")
TEAL = colors.HexColor("#00A4A6")
F, FB = "Times-Roman", "Times-Bold"


class AwsArch(Flowable):
    W, H = 850, 500

    def __init__(self, scale=1.0):
        super().__init__()
        self.s = scale
        self.width, self.height = self.W * scale, self.H * scale

    # helpers -----------------------------------------------------------
    def icon(self, img, cx, cy, l1, l2=None, size=40, side="below", grey=False):
        c = self.canv
        c.drawImage(IC + img, cx - size / 2, cy - size / 2, size, size, mask="auto")
        col = colors.HexColor("#8A9099") if grey else colors.black
        c.setFillColor(col)
        if side == "below":
            c.setFont(F, 8)
            c.drawCentredString(cx, cy - size / 2 - 11, l1)
            if l2:
                c.setFont(F, 7.5)
                c.drawCentredString(cx, cy - size / 2 - 21, l2)
        else:
            c.setFont(F, 8)
            c.drawString(cx + size / 2 + 6, cy + 2, l1)
            if l2:
                c.setFont(F, 7.5)
                c.drawString(cx + size / 2 + 6, cy - 8, l2)

    def path(self, pts, dash=None, head=True, color=LINE, width=0.9):
        c = self.canv
        c.setStrokeColor(color)
        c.setLineWidth(width)
        c.setDash(*dash) if dash else c.setDash()
        p = c.beginPath()
        p.moveTo(*pts[0])
        for x, y in pts[1:]:
            p.lineTo(x, y)
        c.drawPath(p, stroke=1, fill=0)
        c.setDash()
        if head:
            (x1, y1), (x2, y2) = pts[-2], pts[-1]
            import math
            a = math.atan2(y2 - y1, x2 - x1)
            L, w = 6.5, 3.2
            bx, by = x2 - L * math.cos(a), y2 - L * math.sin(a)
            px, py = -math.sin(a) * w, math.cos(a) * w
            c.setFillColor(color)
            h = c.beginPath()
            h.moveTo(x2, y2); h.lineTo(bx + px, by + py); h.lineTo(bx - px, by - py); h.close()
            c.drawPath(h, stroke=0, fill=1)

    def label(self, x, y, t, anchor="middle", size=7.5, color=LINE):
        c = self.canv
        c.setFont(F, size)
        c.setFillColor(color)
        {"middle": c.drawCentredString, "start": c.drawString, "end": c.drawRightString}[anchor](x, y, t)

    # drawing -----------------------------------------------------------
    def draw(self):
        c = self.canv
        c.saveState()
        c.scale(self.s, self.s)
        grey = colors.HexColor("#9AA0A8")

        # AWS Cloud group
        c.setStrokeColor(colors.HexColor("#232F3E")); c.setLineWidth(0.9)
        c.rect(112, 8, 733, 482, stroke=1, fill=0)
        c.setFillColor(colors.HexColor("#232F3E"))
        c.rect(112, 472, 20, 18, stroke=0, fill=1)
        c.drawImage(AWSLOGO, 114, 475, 16, 12, mask="auto", preserveAspectRatio=True)
        c.setFillColor(colors.black); c.setFont(FB, 8.5)
        c.drawString(138, 478, "AWS Cloud")

        # Region group
        c.setStrokeColor(TEAL); c.setDash(4, 2.5)
        c.rect(250, 20, 585, 445, stroke=1, fill=0)
        c.setDash()
        c.setFillColor(TEAL); c.setFont(F, 8)
        c.drawString(258, 453, "Region us-east-1 (N. Virginia)")

        # Lambda group (LabRole)
        c.setStrokeColor(colors.HexColor("#D86613")); c.setDash(3, 2)
        c.rect(310, 85, 102, 280, stroke=1, fill=0)
        c.setDash()
        c.setFillColor(colors.HexColor("#D86613")); c.setFont(F, 7)
        c.drawCentredString(361, 89, "LabRole (bawaan sandbox)")

        # Planned group
        c.setStrokeColor(grey); c.setDash(3, 2)
        c.rect(660, 255, 160, 120, stroke=1, fill=0)
        c.setDash()
        self.label(666, 365, "Planned (tahap lanjut)", anchor="start", size=7, color=grey)

        # icons
        self.icon("users.png", 55, 240, "Peserta &", "penyelenggara")
        self.icon("cloudfront.png", 185, 400, "Amazon CloudFront", "HTTPS + OAC")
        self.icon("s3.png", 330, 415, "Amazon S3", "frontend (privat)")
        self.icon("lambda.png", 361, 325, "media-service", "presigned URL poster")
        self.icon("lambda.png", 361, 244, "event-service", "CRUD acara")
        self.icon("lambda.png", 361, 160, "auth-service", "daftar / login, token")
        self.icon("s3.png", 560, 325, "Amazon S3", "poster acara (privat)")
        self.icon("s3.png", 560, 195, "Amazon S3", "data: events/ + users/")
        self.icon("cloudwatch.png", 560, 70, "CloudWatch Logs", None, size=36)
        self.icon("cwalarm.png", 690, 70, "CloudWatch Alarm", "Errors Lambda", size=36)
        self.icon("sns.png", 790, 70, "Amazon SNS", "email admin", size=36)
        self.icon("lambda_faded.png", 740, 315, "booking-service", "kuota via If-Match", size=34, grey=True)
        c.drawImage(IC + "cloudformation.png", 262, 30, 20, 20, mask="auto")
        self.label(287, 36, "Semua resource dibuat dari template AWS SAM / CloudFormation", anchor="start", size=7)

        # users -> CloudFront
        self.path([(55, 262), (55, 400), (163, 400)])
        self.label(85, 405, "HTTPS")
        # users -> Function URL tiap Lambda
        self.path([(77, 244), (339, 244)])
        self.label(165, 249, "HTTPS + token")
        self.label(165, 233, "(Lambda Function URL)")
        c.setFillColor(LINE); c.circle(270, 244, 1.8, stroke=0, fill=1)
        self.path([(270, 244), (270, 325), (339, 325)])
        self.path([(270, 244), (270, 160), (339, 160)])
        self.label(289, 329, "/uploads")
        self.label(289, 248, "/events")
        self.label(289, 164, "/auth/*")

        # CloudFront -> buckets
        self.path([(207, 400), (240, 400), (240, 415), (308, 415)])
        c.setFillColor(LINE); c.circle(240, 415, 1.8, stroke=0, fill=1)
        self.path([(240, 415), (240, 440), (560, 440), (560, 347)])
        self.label(440, 444, "/photos/*")

        # functions -> data
        self.path([(383, 325), (538, 325)])
        self.label(470, 329, "presigned PUT")
        self.path([(383, 244), (490, 244), (490, 202), (538, 202)])
        self.label(452, 248, "events/ (If-Match)")
        self.path([(383, 160), (490, 160), (490, 188), (538, 188)])
        self.label(452, 164, "users/")

        # monitoring
        self.path([(361, 85), (361, 70), (542, 70)])
        self.label(450, 74, "log")
        self.path([(708, 70), (772, 70)])

        # planned
        self.path([(740, 268), (740, 195), (582, 195)], dash=(4, 3), color=grey)
        c.restoreState()


if __name__ == "__main__":
    from reportlab.pdfgen import canvas
    out = sys.argv[1]
    cv = canvas.Canvas(out, pagesize=(AwsArch.W + 10, AwsArch.H + 10))
    a = AwsArch()
    a.drawOn(cv, 5, 5)
    cv.save()
