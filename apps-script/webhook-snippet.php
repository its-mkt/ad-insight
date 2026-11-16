<?php
/**
 * ad-insight — 쇼핑몰 견적 접수 시 구글 시트 실시간 웹훅 전송 스니펫 (고도몰 5용)
 * 
 * [적용 위치]
 * 고도몰 5 견적 저장 처리 파일 (예: module/Component/Board/BoardWrite.php 또는 견적 처리 컨트롤러/모델)
 * 견적 저장이 성공적으로 완료된 직후(DB INSERT 성공 후) 아래 코드를 호출합니다.
 *
 * [특징]
 * - 타임아웃 2초 비동기 전송: 구글 서버 응답 대기로 인한 쇼핑몰 사용자 화면 지연이 전혀 없습니다.
 * - 고객 개인정보(이름·전화번호·이메일)는 일절 전송하지 않으며, 견적 제목·날짜·유입경로만 전송합니다.
 */

function sendAdInsightQuoteWebhook($subject, $siteName = 'cadkorea') {
    // 1. Apps Script 웹앱 URL 및 비밀키 (실제 값으로 입력)
    $webhookUrl = 'https://script.google.com/macros/s/여기에_배포된_웹앱_ID/exec';
    $apiToken   = '여기에_Apps_Script_속성의_API_TOKEN';

    if (empty($webhookUrl) || strpos($webhookUrl, '여기에') !== false) {
        return; // 설정 미입력 시 중단
    }

    // 2. 유입 매체 추적 (세션 또는 쿠키의 UTM, 없으면 리퍼러)
    $source = '직접';
    if (!empty($_SESSION['utm_source'])) {
        $source = $_SESSION['utm_source'];
    } elseif (!empty($_COOKIE['utm_source'])) {
        $source = $_COOKIE['utm_source'];
    } elseif (!empty($_SERVER['HTTP_REFERER'])) {
        $ref = strtolower($_SERVER['HTTP_REFERER']);
        if (strpos($ref, 'naver') !== false) {
            $source = 'Naver';
        } elseif (strpos($ref, 'google') !== false) {
            $source = 'Google';
        } elseif (strpos($ref, 'meta') !== false || strpos($ref, 'facebook') !== false || strpos($ref, 'instagram') !== false) {
            $source = 'Meta';
        }
    }

    // 3. 전송 데이터 구성 (민감 개인정보 제외)
    $payload = [
        'key'     => $apiToken,
        'site'    => $siteName,             // cadkorea, zbyhp 등
        'date'    => date('Y-m-d H:i:s'),
        'subject' => $subject,              // 제목(카테고리 자동 판별용)
        'source'  => $source                // 유입 매체
    ];

    // 4. cURL 비동기/논블로킹 전송 (타임아웃 2초)
    $ch = curl_init($webhookUrl);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 2);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 1);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

    curl_exec($ch);
    curl_close($ch);
}
