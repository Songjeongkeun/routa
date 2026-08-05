import multer from "multer"
import path from "path"
import fs from "fs"

/** 파일 저장 경로 */ 
const profileUploadPath = path.resolve("public", "uploads", "profiles")

// 폴더 없으면 자동 생성
if(!fs.existsSync(profileUploadPath)){
    fs.mkdirSync(profileUploadPath, {recursive: true})
}

/** 파일 저장방식 설정 */ 
const storage = multer.diskStorage({ // 서버 폴더(디스크)에 서장
    // 폴더 설정: callback=저장위치 알려줌
    destination: (req, file, callback) => {
        callback(null, profileUploadPath)
    },
    filename: (req, file, callback) => {
        const extension = path.extname(file.originalname)
        const filename = `${Date.now()}_${Math.round(Math.random() * 1e9)}${extension}`
        callback(null, filename)
    },
})


// 업로드 미들웨어
export const uploadProfileImage = multer({
    storage, // 저장 방식 설정
    limits: {fileSize: 2 * 1024 * 1024}, // 최대 파일 크기
    
    // 업로드 파일 검사
    fileFilter: (req, file, callback) => {
        if (file.mimetype.startsWith("image/")){
            callback(null, true) // 통과, 업로드 허용
        }else{
            const error = new Error("이미지파일만 업로드 가능합니다.")
            error.status = 400
            callback(error, false)
        
        }
    }
})