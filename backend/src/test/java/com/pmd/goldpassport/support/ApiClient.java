package com.pmd.goldpassport.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Small HTTP helper so integration tests read like the user journey. */
public class ApiClient {

    /** Minimal byte sequences that pass the server's content sniffing. */
    public static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16, 'J', 'F', 'I', 'F', 0, 1, 1, 0, 0, 1};
    public static final byte[] PDF = "%PDF-1.4\n% test document\n".getBytes(StandardCharsets.US_ASCII);

    private final MockMvc mvc;
    private final ObjectMapper json;

    public ApiClient(MockMvc mvc, ObjectMapper json) {
        this.mvc = mvc;
        this.json = json;
    }

    public record Response(int status, JsonNode body) {
    }

    public static String randomPhone() {
        return "+519" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
    }

    public static String randomDni() {
        return String.format("%08d", ThreadLocalRandom.current().nextInt(10_000_000, 100_000_000));
    }

    /** Random RUC (prefix 20) with a correct SUNAT check digit. */
    public static String randomRuc() {
        int[] w = {5, 4, 3, 2, 7, 6, 5, 4, 3, 2};
        String base = "20" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
        int sum = 0;
        for (int i = 0; i < 10; i++) {
            sum += (base.charAt(i) - '0') * w[i];
        }
        int check = 11 - (sum % 11);
        if (check == 10) {
            check = 0;
        } else if (check == 11) {
            check = 1;
        }
        return base + check;
    }

    /** OTP login (local mode with expose-code=true returns the code). Returns the bearer token. */
    public String login(String phone) throws Exception {
        Response challenge = send(MockMvcRequestBuilders.post("/api/v1/auth/otp/request"), null, Map.of("phone", phone));
        String code = challenge.body().get("devCode").asText();
        Response token = send(MockMvcRequestBuilders.post("/api/v1/auth/otp/verify"), null, Map.of("phone", phone, "code", code));
        return token.body().get("accessToken").asText();
    }

    public Response get(String token, String url, Object... vars) throws Exception {
        return send(MockMvcRequestBuilders.get(url, vars), token, null);
    }

    public Response post(String token, String url, Object body, Object... vars) throws Exception {
        return send(MockMvcRequestBuilders.post(url, vars), token, body);
    }

    public Response put(String token, String url, Object body, Object... vars) throws Exception {
        return send(MockMvcRequestBuilders.put(url, vars), token, body);
    }

    public Response upload(String token, String url, String fileName, String contentType, byte[] bytes,
            Map<String, String> params, Object... vars) throws Exception {
        MockMultipartHttpServletRequestBuilder req = multipart(url, vars)
                .file(new MockMultipartFile("file", fileName, contentType, bytes));
        params.forEach(req::param);
        return send(req, token, null);
    }

    /** Upload with an {@code Idempotency-Key} header, as the mobile offline outbox sends it. */
    public Response uploadIdempotent(String idempotencyKey, String token, String url, String fileName,
            String contentType, byte[] bytes, Map<String, String> params, Object... vars) throws Exception {
        MockMultipartHttpServletRequestBuilder req = multipart(url, vars)
                .file(new MockMultipartFile("file", fileName, contentType, bytes));
        params.forEach(req::param);
        req.header("Idempotency-Key", idempotencyKey);
        return send(req, token, null);
    }

    private Response send(MockHttpServletRequestBuilder req, String token, Object body) throws Exception {
        if (token != null) {
            req.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        }
        if (body != null) {
            req.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body));
        }
        MvcResult result = mvc.perform(req).andReturn();
        String content = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode node = content.isBlank() ? com.fasterxml.jackson.databind.node.NullNode.getInstance() : json.readTree(content);
        return new Response(result.getResponse().getStatus(), node);
    }
}
