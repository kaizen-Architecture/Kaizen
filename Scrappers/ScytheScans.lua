--------------------------------------
-- @name ScytheScans
-- @url https://scythescans.com
-- @author Antigravity
-- @license MIT
--------------------------------------

----- IMPORTS -----
local function safe_require(module)
    local ok, res = pcall(require, module)
    if ok then return res end
    return nil
end

Html = safe_require("html")
Http = safe_require("http")
HttpUtil = safe_require("http_util")
Headless = safe_require("headless")
Time = safe_require("time")
--- END IMPORTS ---

----- VARIABLES -----
Client = Http and Http.client()
Base = "https://scythescans.com"
Delay = 2

local function getBrowser()
    if Headless and Headless.browser then
        local ok, b = pcall(function() return Headless.browser() end)
        if ok and b then return b end
    end
    return nil
end

Browser = getBrowser()
--- END VARIABLES ---

----- HELPERS -----
local function getBody(url)
    local body = ""
    local success = false

    if Browser and Browser.page then
        pcall(function()
            local page = Browser:page()
            page:navigate(url)
            if Time and Time.sleep then Time.sleep(Delay) end
            page:waitLoad()
            body = page:html()
            success = true
        end)
    end

    if not success and Client then
        local request = Http.request("GET", url)
        pcall(function()
            request:header_set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
            request:header_set("Referer", Base)
        end)
        local result = Client:do_request(request)
        if result and result.body then
            body = result.body
        end
    end
    return body
end

local function trim(s)
    if not s then return "" end
    return (string.gsub(s, "^%s*(.-)%s*$", "%1"))
end

local function Reverse(t)
    local n = #t
    local i = 1
    while i < n do
        t[i], t[n] = t[n], t[i]
        i = i + 1
        n = n - 1
    end
    return t
end

-- Pure Lua Base64 decoder
local b = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local function base64_decode(data)
    data = string.gsub(data, '[^'..b..'=]', '')
    return (data:gsub('.', function(x)
        if (x == '=') then return '' end
        local r,f='',(b:find(x)-1)
        for i=6,1,-1 do r=r..(f%2^i-f%2^(i-1)>0 and '1' or '0') end
        return r;
    end):gsub('%d%d%d%d%d%d%d%d', function(x)
        local c=0
        for i=1,8 do c=c+(x:sub(i,i)=='1' and 2^(8-i) or 0) end
        return string.char(c)
    end))
end
--- END HELPERS ---

----- MAIN -----

--- Searches for manga with given query.
-- @param query Query to search for
-- @return Table of tables with the following fields: name, url
function SearchManga(query)
    local url = Base .. "/?s=" .. HttpUtil.query_escape(query)
    local body = getBody(url)
    if body == "" then return {} end

    local doc = Html.parse(body)
    local mangas = {}

    doc:find(".listupd .bsx"):each(function(i, s)
        local a = s:find("a"):first()
        if a then
            local href = a:attr("href")
            local name = a:attr("title")
            if not name or name == "" then
                local tt = s:find(".tt"):first()
                if tt then name = tt:text() end
            end
            if href and name and name ~= "" then
                if not href:find("http") then href = Base .. href end
                table.insert(mangas, { name = trim(name), url = href })
            end
        end
    end)

    return mangas
end

--- Gets the list of all manga chapters.
-- @param mangaURL URL of the manga
-- @return Table of tables with the following fields: name, url
function MangaChapters(mangaURL)
    local body = getBody(mangaURL)
    if body == "" then return {} end

    local doc = Html.parse(body)
    local chapters = {}

    doc:find(".eph-num a"):each(function(i, s)
        local href = s:attr("href")
        local name = ""
        local span = s:find(".chapternum"):first()
        if span then
            name = span:text()
        else
            name = s:text()
        end
        if href and name ~= "" then
            if not href:find("http") then href = Base .. href end
            table.insert(chapters, { name = trim(name), url = href })
        end
    end)

    return Reverse(chapters)
end

--- Gets the list of all pages of a chapter.
-- @param chapterURL URL of the chapter
-- @return Table of tables with the following fields: url, index
function ChapterPages(chapterURL)
    local body = getBody(chapterURL)
    if body == "" then return {} end

    local doc = Html.parse(body)
    local pages = {}

    -- Strategy 1: Look for images inside #readerarea
    doc:find("#readerarea img"):each(function(i, s)
        local src = s:attr("src") or s:attr("data-src") or s:attr("data-lazy-src")
        if src and not src:find("readerarea%.svg") and not src:find("loading") and not src:find("logo") then
            src = trim(src)
            if src:sub(1, 2) == "//" then src = "https:" .. src end
            if not src:find("http") then src = Base .. src end
            table.insert(pages, { index = #pages + 1, url = src })
        end
    end)

    -- Strategy 2: Look for ts_reader.run JSON in raw body
    if #pages == 0 then
        local jsonStr = body:match('ts_reader%.run%((%b{})%)')
        if jsonStr then
            for imgUrl in jsonStr:gmatch('"(https?:\\/[^"]+)"') do
                local url = imgUrl:gsub('\\', '')
                if not url:find("logo") and not url:find("icon") then
                    table.insert(pages, { index = #pages + 1, url = url })
                end
            end
        end
    end

    -- Strategy 3: Look for base64 encoded inline scripts
    if #pages == 0 then
        doc:find("script"):each(function(i, s)
            local src = s:attr("src")
            if src and src:sub(1, 29) == "data:text/javascript;base64," then
                local base64_str = src:sub(30)
                local decoded = base64_decode(base64_str)
                if decoded:find("ts_reader.run") or decoded:find("images") then
                    for imgUrl in decoded:gmatch('"(https?:\\/[^"]+)"') do
                        local url = imgUrl:gsub('\\', '')
                        if not url:find("logo") and not url:find("icon") then
                            table.insert(pages, { index = #pages + 1, url = url })
                        end
                    end
                end
            end
        end)
    end

    return pages
end
--- END MAIN ---
